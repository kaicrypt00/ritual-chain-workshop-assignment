"use client";

import { useState } from "react";
import { usePublicClient } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import type { Bounty } from "@/lib/bounty";
import { decodeAiReview } from "@/lib/aiReview";
import { formatReward } from "@/lib/format";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Button,
  TxStatus,
  Notice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function FinalizeWinner({
  bountyId,
  bounty,
  isOwner,
  onFinalized,
}: {
  bountyId: bigint;
  bounty: Bounty;
  isOwner: boolean;
  onFinalized: () => void;
}) {
  const count = Number(bounty.submissionCount); // only *revealed* submissions
  const recommended = decodeAiReview(bounty.aiReview)?.parsed?.winnerIndex;
  const publicClient = usePublicClient({ chainId: ritualChain.id });

  // `override === null` means "untouched, show the AI recommendation"
  const [override, setOverride] = useState<string | null>(null);
  const winnerInput = override ?? (recommended !== undefined ? String(recommended) : "");

  const [revealedIndices, setRevealedIndices] = useState<Set<number> | null>(null);
  const [checking, setChecking] = useState(false);
  const [finalizeCompleted, setFinalizeCompleted] = useState(false);

  const tx = useWriteTx(() => {
    setFinalizeCompleted(true);
    onFinalized();
  });

  // Gate per spec: owner only, judged, not finalized
  if (!isOwner || !bounty.judged || bounty.finalized || finalizeCompleted) return null;

  const idxNum = Number(winnerInput);
  const inRange =
    winnerInput !== "" && Number.isInteger(idxNum) && idxNum >= 0 && idxNum < count;

  // Extra safety: was this index actually revealed?
  // revealedIndices is populated lazily when the user clicks "Verify"
  const isConfirmedRevealed = revealedIndices ? revealedIndices.has(idxNum) : null;
  const valid = inRange && isConfirmedRevealed !== false;

  async function verifyRevealed() {
    if (!publicClient || !contractAddress || !inRange) return;
    setChecking(true);
    try {
      // getSubmission only returns entries that were revealed; if it doesn't
      // revert and returns a non-zero submitter, the index was revealed.
      const res = (await publicClient.readContract({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "getSubmission",
        args: [bountyId, BigInt(idxNum)],
      })) as [string, string, `0x${string}`, boolean];
      const submitter = res?.[0];
      setRevealedIndices((prev) => {
        const s = new Set(prev ?? []);
        if (submitter && !/^0x0+$/.test(submitter)) s.add(idxNum);
        return s;
      });
    } catch {
      // If getSubmission reverts the index is out of range (shouldn't happen
      // since we already range-check against count, but be defensive).
      setRevealedIndices((prev) => new Set(prev ?? []));
    } finally {
      setChecking(false);
    }
  }

  async function handleFinalize() {
    if (!valid || !contractAddress) return;
    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "finalizeWinner",
        args: [bountyId, BigInt(idxNum)],
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Finalize winner"
        subtitle="Pays the reward to the chosen submission. Only one winner."
      />
      <CardBody className="space-y-3">
        <Notice tone="zinc">
          Only one winner receives the bounty reward ({formatReward(bounty.reward)}).
          You can only pick an index that was <strong>revealed</strong> during Phase 2.
        </Notice>

        <Field
          label="Winner index"
          hint={
            recommended !== undefined
              ? `AI recommends #${recommended}. You decide the final winner.`
              : `Choose a revealed submission index (0–${Math.max(count - 1, 0)}).`
          }
        >
          <div className="flex gap-2">
            <Input
              type="number"
              min={0}
              max={Math.max(count - 1, 0)}
              value={winnerInput}
              onChange={(e) => {
                setOverride(e.target.value);
                // Reset verification when user changes the index
                setRevealedIndices(null);
              }}
            />
            <Button
              type="button"
              onClick={verifyRevealed}
              disabled={!inRange || checking}
              className="shrink-0 px-3 text-sm"
            >
              {checking ? "Checking…" : "Verify"}
            </Button>
          </div>
        </Field>

        {winnerInput !== "" && !inRange && (
          <p className="text-xs text-amber-300">
            Index must be between 0 and {Math.max(count - 1, 0)}.
          </p>
        )}

        {inRange && isConfirmedRevealed === false && (
          <Notice tone="amber">
            ⚠️ Submission #{idxNum} was <strong>not revealed</strong> during Phase 2 and cannot
            win. Pick a different index.
          </Notice>
        )}

        {inRange && isConfirmedRevealed === true && (
          <p className="text-xs text-emerald-400">
            ✅ Submission #{idxNum} was revealed and is eligible.
          </p>
        )}

        {inRange && isConfirmedRevealed === null && (
          <p className="text-xs text-zinc-500">
            Click <strong>Verify</strong> to confirm this submission was revealed before
            finalizing.
          </p>
        )}

        <Button
          onClick={handleFinalize}
          disabled={!inRange || isConfirmedRevealed === false || tx.isBusy}
          className="w-full"
        >
          {tx.isBusy ? "Finalizing…" : "Finalize winner"}
        </Button>

        <TxStatus
          state={tx.state}
          error={tx.error}
          hash={tx.hash}
          explorerBase={explorerBase}
        />
      </CardBody>
    </Card>
  );
}
