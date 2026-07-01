"use client";

import { useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import type { Bounty } from "@/lib/bounty";
import { useWriteTx } from "@/hooks/useWriteTx";
import { useNow } from "@/hooks/useNow";
import { formatRelative } from "@/lib/format";
import { Card, CardHeader, CardBody, Button, TxStatus, Notice, Spinner } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function JudgeAll({
  bountyId,
  bounty,
  isOwner,
  onJudged,
}: {
  bountyId: bigint;
  bounty: Bounty;
  isOwner: boolean;
  onJudged: () => void;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const now = useNow();
  const nowSeconds = now / 1000;

  const [gathering, setGathering] = useState(false);
  const [gatherError, setGatherError] = useState<string | null>(null);
  const [judgedCompleted, setJudgedCompleted] = useState(false);

  const tx = useWriteTx(() => {
    setJudgedCompleted(true);
    onJudged();
  });

  const count = Number(bounty.submissionCount); // revealed submissions only
  const revealSec = Number(bounty.revealDeadline) > 50000000000 ? Number(bounty.revealDeadline) / 1000 : Number(bounty.revealDeadline);
  const revealDeadlinePassed = nowSeconds >= revealSec;
  const timeUntilReveal = revealDeadlinePassed
    ? null
    : formatRelative(bounty.revealDeadline);

  // Gate: owner only, not yet judged/finalized
  if (!isOwner || bounty.judged || bounty.finalized || judgedCompleted) return null;

  // --- Real Ritual LLM (requires funded RitualWallet + TEE executor) ---
  async function handleJudge() {
    if (!publicClient || !contractAddress) return;
    setGatherError(null);
    setGathering(true);
    try {
      const { buildJudgeAllLlmInput } = await import("@/lib/ritualLlm");
      const { executorAddress } = await import("@/config/contract");

      const subs: { index: number; submitter: string; answer: string }[] = [];
      for (let i = 0; i < count; i++) {
        const res = (await publicClient.readContract({
          address: contractAddress,
          abi: aiJudgeAbi,
          functionName: "getSubmission",
          args: [bountyId, BigInt(i)],
        })) as [string, string, `0x${string}`, boolean];
        subs.push({ index: i, submitter: res[0], answer: res[1] });
      }

      const llmInput = buildJudgeAllLlmInput({
        executorAddress,
        title: bounty.title,
        rubric: bounty.rubric,
        submissions: subs,
      });

      setGathering(false);

      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "judgeAll",
        args: [bountyId, llmInput],
        chainId: ritualChain.id,
      });
    } catch (e) {
      setGathering(false);
      setGatherError(
        (e as { shortMessage?: string; message?: string }).shortMessage ||
          (e as Error).message ||
          "LLM judging failed. Make sure your RitualWallet is funded and an active TEE executor is available.",
      );
    }
  }

  const busy = gathering || tx.isBusy;

  return (
    <Card>
      <CardHeader
        title="Judge all submissions"
        subtitle={
          revealDeadlinePassed && count > 0
            ? `${count} revealed answer${count !== 1 ? "s" : ""} ready for judgment`
            : "Waiting for reveal phase to end"
        }
      />
      <CardBody className="space-y-3">
        {/* Phase gate: can only judge after reveal deadline */}
        {!revealDeadlinePassed ? (
          <>
            <Notice tone="amber">
              ⏳ Judging unlocks after the Reveal Phase ends ({timeUntilReveal ?? "soon"}).
            </Notice>
            <Button
              disabled={true}
              className="w-full"
            >
              🤖 Judge via Ritual LLM (Waiting for Reveal Phase)
            </Button>
          </>
        ) : count === 0 ? (
          <>
            <Notice tone="amber">
              No answers were revealed during the reveal phase. Judging requires at least one revealed submission.
            </Notice>
            <Button
              disabled={true}
              className="w-full"
            >
              🤖 Judge via Ritual LLM (No submissions)
            </Button>
          </>
        ) : (
          <>
            <Notice tone="green">
              AI review is advisory. After judging, you (the owner) select the final winner.
            </Notice>

            {/* Submissions summary */}
            <div className="rounded-xl bg-zinc-950/40 border border-white/5 px-4 py-3 text-sm text-zinc-300">
              <span className="font-bold text-emerald-400">{count}</span>{" "}
              revealed answer{count !== 1 ? "s" : ""} ready to judge
            </div>

            {/* Primary judging action: Real Ritual LLM */}
            <Button
              onClick={handleJudge}
              disabled={busy}
              className="w-full"
            >
              {gathering ? (
                <><Spinner /> Gathering {count} submissions…</>
              ) : tx.isBusy ? (
                "Calling Ritual LLM…"
              ) : (
                `🤖 Judge via Ritual LLM (${count})`
              )}
            </Button>
          </>
        )}

        {gatherError && <Notice tone="red">{gatherError}</Notice>}
        <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
      </CardBody>
    </Card>
  );
}
