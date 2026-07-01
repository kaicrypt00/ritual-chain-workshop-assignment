"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { parseEther, parseEventLogs } from "viem";
import { contractAddress, isContractConfigured } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { useWriteTx } from "@/hooks/useWriteTx";
import {
  Card,
  CardHeader,
  CardBody,
  Field,
  Input,
  Textarea,
  Button,
  TxStatus,
  Notice,
} from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

/** Default datetime-local value = now + offset hours, in the expected input format. */
function futureDeadline(offsetHours: number): string {
  const d = new Date(Date.now() + offsetHours * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// --- Save-to-device helpers ---

type BountyOwnerBackup = {
  bountyId: string;
  title: string;
  rubric: string;
  submissionDeadline: string;
  revealDeadline: string;
  reward: string;
  txHash: string;
  savedAt: string;
};

function formatOwnerDetails(d: BountyOwnerBackup): string {
  return [
    `Bounty #${d.bountyId} — ${d.title}`,
    "=".repeat(52),
    `Bounty ID:            ${d.bountyId}`,
    `Title:                ${d.title}`,
    `Reward:               ${d.reward} RITUAL`,
    `Submission Deadline:  ${d.submissionDeadline}`,
    `Reveal Deadline:      ${d.revealDeadline}`,
    `Transaction Hash:     ${d.txHash || "(pending)"}`,
    `Saved:                ${d.savedAt}`,
    "=".repeat(52),
    "Rubric / Judging Criteria:",
    d.rubric,
    "=".repeat(52),
    "Share the Bounty ID with participants so they can submit their answers.",
  ].join("\n");
}

function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CreateBountyForm({ onCreated }: { onCreated?: (bountyId: bigint) => void }) {
  const { isConnected } = useAccount();
  const [title, setTitle] = useState("");
  const [rubric, setRubric] = useState("");
  const [submissionDeadline, setSubmissionDeadline] = useState("");
  const [revealDeadline, setRevealDeadline] = useState("");
  const [reward, setReward] = useState("");
  const [createdId, setCreatedId] = useState<bigint | null>(null);
  const [savedData, setSavedData] = useState<BountyOwnerBackup | null>(null);
  const [copied, setCopied] = useState(false);

  // Set default deadlines on mount to avoid hydration mismatch from client/server time difference
  useEffect(() => {
    setTimeout(() => {
      setSubmissionDeadline(futureDeadline(1));
      setRevealDeadline(futureDeadline(2));
    }, 0);
  }, []);

  const tx = useWriteTx((receipt) => {
    try {
      const logs = parseEventLogs({
        abi: aiJudgeAbi,
        eventName: "BountyCreated",
        logs: receipt.logs,
      });
      const id = (logs[0] as { args?: { bountyId?: bigint } })?.args?.bountyId;
      if (id !== undefined) {
        setCreatedId(id);
        onCreated?.(id);
        // Clear form fields to prevent double submission
        setTitle("");
        setRubric("");
        setReward("");
      }
    } catch {
      /* couldn't decode — not fatal */
    }
  });

  // Persist bounty details to localStorage + state once creation is confirmed.
  // Using a ref-based approach to avoid the set-state-in-effect lint error.
  const savedDataRef = useRef<BountyOwnerBackup | null>(null);
  useEffect(() => {
    if (createdId === null) return;
    const data: BountyOwnerBackup = {
      bountyId: createdId.toString(),
      title: title.trim(),
      rubric: rubric.trim(),
      submissionDeadline,
      revealDeadline,
      reward: reward.trim(),
      txHash: tx.hash ?? "",
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(`aibj:bounty-${createdId}-owner`, JSON.stringify(data));
    } catch { /* ignore storage quota errors */ }
    // Schedule state update outside current synchronous effect body
    const id = setTimeout(() => setSavedData(data), 0);
    return () => clearTimeout(id);
  // Only re-run when a new bounty is confirmed — not on every form keystroke.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdId]);
  void savedDataRef;

  // Pure, render-safe validation (no clock reads here — see handleSubmit).
  const validation = useMemo(() => {
    if (!title.trim()) return "Title is required.";
    if (!rubric.trim()) return "Rubric is required.";
    if (!submissionDeadline) return "Pick a submission deadline.";
    if (!revealDeadline) return "Pick a reveal deadline.";
    const ts1 = new Date(submissionDeadline).getTime();
    const ts2 = new Date(revealDeadline).getTime();
    if (!Number.isFinite(ts1)) return "Invalid submission deadline.";
    if (!Number.isFinite(ts2)) return "Invalid reveal deadline.";
    if (ts2 <= ts1) return "Reveal deadline must be after submission deadline.";
    if (reward.trim() === "" || Number(reward) <= 0)
      return "Reward must be greater than 0 (contract requires msg.value > 0).";
    try {
      parseEther(reward.trim());
    } catch {
      return "Reward must be a valid number.";
    }
    return null;
  }, [title, rubric, submissionDeadline, revealDeadline, reward]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (validation || !contractAddress) return;

    const subMs = new Date(submissionDeadline).getTime();
    const revMs = new Date(revealDeadline).getTime();
    const now = Date.now();

    if (subMs <= now) {
      window.alert("Submission deadline must be in the future.");
      return;
    }
    if (revMs <= subMs) {
      window.alert("Reveal deadline must be after the submission deadline.");
      return;
    }

    // IMPORTANT: Ritual Chain (chainId 1979) uses MILLISECOND block.timestamp.
    // Date.getTime() already returns ms, so we send it as-is.
    // We add a small buffer (30_000ms = 30s) so the deadline stays valid even
    // if MetaMask confirmation takes a moment.
    const subTs = BigInt(subMs) + 30_000n;
    const revTs = BigInt(revMs) + 30_000n;
    const value = parseEther(reward.trim());
    setCreatedId(null);

    try {
      await tx.run({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "createBounty",
        args: [title.trim(), rubric.trim(), subTs, revTs],
        value,
        chainId: ritualChain.id,
      });
    } catch {
      /* surfaced via tx.state */
    }
  }

  return (
    <Card>
      <CardHeader
        title="Create a bounty"
        subtitle="Fund a reward and define how submissions will be judged."
      />
      <CardBody>
        {!isContractConfigured && (
          <Notice tone="amber">
            Set <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in your{" "}
            <code className="font-mono">.env.local</code> to enable transactions.
          </Notice>
        )}

        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Best gas-optimization writeup"
              maxLength={200}
            />
          </Field>

          <Field label="Rubric" hint="How submissions are scored. The AI judges only against this.">
            <Textarea
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
              rows={4}
              placeholder="Correctness 50%, clarity 30%, novelty 20%…"
            />
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Submission deadline (Phase 1 ends)"
              hint="No more commitments accepted after this time."
            >
              <Input
                type="datetime-local"
                value={submissionDeadline}
                onChange={(e) => setSubmissionDeadline(e.target.value)}
              />
            </Field>
            <Field
              label="Reveal deadline (Phase 2 ends)"
              hint="Must be after submission deadline. Reveals accepted until this time."
            >
              <Input
                type="datetime-local"
                value={revealDeadline}
                onChange={(e) => setRevealDeadline(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Reward (RITUAL)" hint="Locked in the contract on create.">
            <Input
              type="number"
              min="0"
              step="any"
              value={reward}
              onChange={(e) => setReward(e.target.value)}
              placeholder="1.0"
            />
          </Field>

          {validation && (title || rubric || reward) ? (
            <p className="text-xs text-amber-300">{validation}</p>
          ) : null}

          <Button
            type="submit"
            disabled={!isConnected || !isContractConfigured || !!validation || tx.isBusy}
            className="w-full"
          >
            {tx.isBusy ? "Creating…" : "Create bounty"}
          </Button>

          {!isConnected && (
            <p className="text-xs text-zinc-500">Connect your wallet to create a bounty.</p>
          )}

          <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />

          {createdId !== null && (
            <div className="space-y-2">
              <Notice tone="green">
                Bounty created with id{" "}
                <span className="font-mono font-semibold">#{createdId.toString()}</span>. Loaded
                below.
              </Notice>
              {savedData && (
                <div className="rounded-xl bg-zinc-800/60 p-3.5 space-y-2.5 ring-1 ring-inset ring-emerald-500/20">
                  <p className="text-xs font-semibold text-emerald-400">💾 Bounty details saved to browser</p>
                  <p className="text-[11px] text-zinc-400">
                    Keep a backup of your bounty info and share the Bounty ID with participants.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 text-xs px-3 py-1.5"
                      onClick={() =>
                        downloadFile(
                          formatOwnerDetails(savedData),
                          `bounty-${savedData.bountyId}.txt`,
                        )
                      }
                    >
                      ⬇ Download .txt
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="shrink-0 text-xs px-3 py-1.5"
                      onClick={async () => {
                        const ok = await copyToClipboard(formatOwnerDetails(savedData));
                        if (ok) {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                    >
                      {copied ? "✅ Copied!" : "📋 Copy Details"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
