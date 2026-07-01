"use client";

import { useState } from "react";
import type { Bounty } from "@/lib/bounty";
import { getBountyStatus, STATUS_META } from "@/lib/bounty";
import { useNow } from "@/hooks/useNow";
import { shortenAddress, formatReward, formatTimestamp, formatRelative } from "@/lib/format";
import { Card, CardHeader, CardBody, Badge, Stat, Button } from "@/components/ui";

export function BountyDetail({
  bountyId,
  bounty,
  isOwner,
}: {
  bountyId: bigint;
  bounty: Bounty;
  isOwner: boolean;
}) {
  const now = useNow();
  const nowSeconds = now / 1000;
  const status = getBountyStatus(bounty, nowSeconds);
  const meta = STATUS_META[status];

  const [copied, setCopied] = useState(false);

  // Phase banner copy
  const phaseBanner: { node: React.ReactNode; cls: string } | null = (() => {
    switch (status) {
      case "commit":
        return {
          node: (
            <span className="flex items-center">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-2.5" />
              Commit Phase — submit your hidden answer before {formatTimestamp(bounty.submissionDeadline)} ({formatRelative(bounty.submissionDeadline)})
            </span>
          ),
          cls: "bg-emerald-500/5 text-emerald-300 ring-emerald-500/20",
        };
      case "reveal":
        return {
          node: (
            <span className="flex items-center">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 mr-2.5" />
              Reveal Phase — reveal your answer before {formatTimestamp(bounty.revealDeadline)} ({formatRelative(bounty.revealDeadline)})
            </span>
          ),
          cls: "bg-emerald-500/5 text-emerald-200 ring-emerald-500/20",
        };
      case "ready":
        return {
          node: (
            <span className="flex items-center">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400 mr-2.5" />
              Ready to Judge — reveal window has closed, owner can now run judgeAll.
            </span>
          ),
          cls: "bg-amber-500/5 text-amber-300 ring-amber-500/20",
        };
      case "judged":
        return {
          node: (
            <span className="flex items-center">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 mr-2.5" />
              Judged — AI review complete, owner is picking the winner.
            </span>
          ),
          cls: "bg-emerald-500/5 text-emerald-300 ring-emerald-500/20",
        };
      case "finalized":
        return {
          node: (
            <span className="flex items-center">
              <span className="mr-2">🏆</span>
              Finalized — winner is submission #{bounty.winnerIndex.toString()}.
            </span>
          ),
          cls: "bg-zinc-500/5 text-zinc-300 ring-zinc-500/20",
        };
      default:
        return null;
    }
  })();

  const backupText = [
    `Ritual Bounty Owner Backup`,
    `============================================================`,
    `Bounty ID:           #${bountyId.toString()}`,
    `Title:               ${bounty.title}`,
    `Reward:              ${formatReward(bounty.reward)}`,
    `Owner Address:       ${bounty.owner}`,
    `Submission Deadline: ${formatTimestamp(bounty.submissionDeadline)}`,
    `Reveal Deadline:     ${formatTimestamp(bounty.revealDeadline)}`,
    `============================================================`,
    `Rubric / Judging Criteria:`,
    bounty.rubric,
    `============================================================`,
    `Share the Bounty ID (#${bountyId.toString()}) with participants so they can submit their answers.`,
  ].join("\n");

  const downloadBackup = () => {
    const blob = new Blob([backupText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bounty-${bountyId}-owner-backup.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyBackup = async () => {
    try {
      await navigator.clipboard.writeText(backupText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-zinc-500">#{bountyId.toString()}</span>
            <span className="normal-case text-base text-zinc-100 font-semibold">
              {bounty.title || "Untitled"}
            </span>
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            {isOwner && <Badge tone="indigo">You own this</Badge>}
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </div>
        }
      />
      <CardBody className="space-y-4">
        {/* Phase banner */}
        {phaseBanner && (
          <div
            className={`rounded-xl px-3.5 py-2.5 text-xs ring-1 ring-inset ${phaseBanner.cls}`}
          >
            {phaseBanner.node}
          </div>
        )}

        <div>
          <div className="text-[11px] uppercase tracking-wide text-zinc-500">Rubric</div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-200">
            {bounty.rubric || "-"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Reward" value={formatReward(bounty.reward)} />
          <Stat label="Revealed submissions" value={bounty.submissionCount.toString()} />
          <Stat
            label="Commit deadline (Phase 1)"
            value={
              <span>
                {formatTimestamp(bounty.submissionDeadline)}
                <span className="ml-1 text-xs text-zinc-500">
                  ({formatRelative(bounty.submissionDeadline)})
                </span>
              </span>
            }
          />
          <Stat
            label="Reveal deadline (Phase 2)"
            value={
              <span>
                {formatTimestamp(bounty.revealDeadline)}
                <span className="ml-1 text-xs text-zinc-500">
                  ({formatRelative(bounty.revealDeadline)})
                </span>
              </span>
            }
          />
          <Stat label="Owner" value={shortenAddress(bounty.owner)} />
        </div>

        {isOwner && (
          <div className="rounded-xl bg-zinc-950/60 border border-white/5 p-4 text-xs space-y-3">
            <p className="font-semibold text-emerald-400">💾 Bounty Owner Actions:</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                className="text-xs px-3 py-1.5"
                onClick={downloadBackup}
              >
                ⬇ Download Backup
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="text-xs px-3 py-1.5"
                onClick={copyBackup}
              >
                {copied ? "✅ Copied!" : "📋 Copy Details"}
              </Button>
            </div>
          </div>
        )}

        {bounty.finalized && (
          <div className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 ring-1 ring-inset ring-emerald-500/30">
            Finalized — winner is submission{" "}
            <span className="font-mono font-semibold">#{bounty.winnerIndex.toString()}</span>.
          </div>
        )}
      </CardBody>
    </Card>
  );
}

