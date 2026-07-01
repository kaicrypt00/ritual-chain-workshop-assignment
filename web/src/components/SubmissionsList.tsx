"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import type { JudgeResult } from "@/lib/aiReview";
import { Card, CardHeader, CardBody, Badge } from "@/components/ui";

export function SubmissionsList({
  bountyId,
  count,
  judge,
  finalWinner,
}: {
  bountyId: bigint;
  count: number;
  judge?: JudgeResult | null;
  finalWinner?: number;
}) {
  const indices = Array.from({ length: count }, (_, i) => i);

  return (
    <Card>
      <CardHeader
        title="Revealed submissions"
        subtitle="Only answers revealed during Phase 2 are eligible for judging."
        action={<Badge tone="zinc">{count} revealed</Badge>}
      />
      <CardBody className="space-y-3">
        {count === 0 ? (
          <p className="text-sm text-zinc-500">
            No revealed submissions yet. Participants who committed must reveal during Phase 2.
          </p>
        ) : (
          indices.map((i) => (
            <SubmissionRow
              key={i}
              bountyId={bountyId}
              index={i}
              ranking={judge?.ranking?.find((r) => r.index === i)}
              recommended={judge?.winnerIndex === i}
              isWinner={finalWinner === i}
            />
          ))
        )}
      </CardBody>
    </Card>
  );
}

function SubmissionRow({
  bountyId,
  index,
  ranking,
  recommended,
  isWinner,
}: {
  bountyId: bigint;
  index: number;
  ranking?: { index: number; score: number; reason: string };
  recommended?: boolean;
  isWinner?: boolean;
}) {
  const publicClient = usePublicClient({ chainId: ritualChain.id });

  const { data, isLoading } = useQuery({
    queryKey: ["submission", contractAddress, bountyId.toString(), index],
    queryFn: async () => {
      if (!contractAddress || !publicClient) return undefined;
      const res = await publicClient.readContract({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "getSubmission",
        args: [bountyId, BigInt(index)],
      });
      return res as [string, string, `0x${string}`, boolean];
    },
    enabled: !!contractAddress && !!publicClient,
    retry: 2,
  });

  const submitter = data?.[0];
  const answer = data?.[1];
  const revealed = data?.[3];

  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-300 ${
        isWinner
          ? "border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
          : recommended
            ? "border-emerald-500/25 bg-emerald-500/5"
            : "border-white/5 bg-zinc-950/40 hover:border-white/10"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-500">#{index}</span>
          <span className="font-mono text-sm text-zinc-300">
            {submitter ? shortenAddress(submitter) : isLoading ? "loading…" : "-"}
          </span>
          <Badge tone={revealed ? "green" : "amber"}>
            {revealed ? "Revealed" : "Committed"}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          {ranking ? <Badge tone="zinc">score {ranking.score}</Badge> : null}
          {isWinner ? (
            <Badge tone="green">Winner 🏆</Badge>
          ) : recommended ? (
            <Badge tone="indigo">AI pick</Badge>
          ) : null}
        </div>
      </div>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-200">
        {revealed ? (answer ?? (isLoading ? "Loading…" : "-")) : "Committed — Answer not yet revealed"}
      </p>

      {ranking?.reason ? (
        <p className="mt-2 border-t border-white/5 pt-2 text-xs text-zinc-400">
          <span className="text-zinc-500">AI: </span>
          {ranking.reason}
        </p>
      ) : null}
    </div>
  );
}
