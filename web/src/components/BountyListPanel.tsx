"use client";

import { useEffect, useState } from "react";
import { useAllBounties, type BountyWithId } from "@/hooks/useAllBounties";
import { useDismissedBounties } from "@/hooks/useDismissedBounties";
import { useNow } from "@/hooks/useNow";
import { getBountyStatus, STATUS_META } from "@/lib/bounty";
import { formatReward } from "@/lib/format";
import { Card, CardBody, Badge, Spinner, Notice } from "@/components/ui";

export function BountyListPanel({
  selectedId,
  onSelect,
}: {
  selectedId: bigint | null;
  onSelect: (id: bigint | null) => void;
}) {
  const { bounties, isLoading, isError, error } = useAllBounties();
  const { isHidden, restoreAll, hiddenCount } = useDismissedBounties();
  const [activeTab, setActiveTab] = useState<"open" | "completed">("open");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => setMounted(true), 0);
  }, []);

  const now = useNow();
  const nowSeconds = now / 1000;

  // Filter out hidden bounties
  const visible = bounties.filter((b) => !isHidden(b.id));

  const categorized = visible.reduce(
    (acc, b) => {
      const status = getBountyStatus(b, nowSeconds);
      const isOpen = status === "commit" || status === "reveal" || status === "ready";
      if (isOpen) {
        acc.open.push(b);
      } else {
        acc.completed.push(b);
      }
      return acc;
    },
    { open: [] as BountyWithId[], completed: [] as BountyWithId[] }
  );

  const displayedList = activeTab === "open" ? categorized.open : categorized.completed;



  return (
    <Card>
      {/* Tabs */}
      <div className="flex border-b border-white/10">
        <button
          onClick={() => setActiveTab("open")}
          className={`flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
            activeTab === "open"
              ? "border-b-2 border-emerald-500 text-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Open ({categorized.open.length})
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`flex-1 py-3 text-center text-xs font-semibold uppercase tracking-wider transition-colors duration-200 ${
            activeTab === "completed"
              ? "border-b-2 border-emerald-500 text-emerald-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          Completed ({categorized.completed.length})
        </button>
      </div>

      {/* Restore toolbar */}
      {bounties.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-zinc-950/30">
          {hiddenCount > 0 ? (
            <button
              onClick={restoreAll}
              className="text-[11px] text-zinc-400 hover:text-emerald-400 transition-colors duration-150 underline underline-offset-2"
            >
              Restore {hiddenCount} hidden bounti{hiddenCount !== 1 ? "es" : "y"}
            </button>
          ) : (
            <span className="text-[11px] text-zinc-600">
              {bounties.length} bounti{bounties.length !== 1 ? "es" : "y"} on-chain
            </span>
          )}
        </div>
      )}

      <CardBody className="space-y-3 min-h-[300px] max-h-[400px] overflow-y-auto">
        {(!mounted || isLoading) && (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 space-y-2">
            <Spinner />
            <span className="text-xs">Loading bounties from chain…</span>
          </div>
        )}

        {isError && (
          <Notice tone="red">
            Failed to read bounties from contract. Check connection or contract configuration.
            {error && <p className="mt-1 font-mono text-[10px] opacity-75">{error.message || String(error)}</p>}
          </Notice>
        )}

        {mounted && !isLoading && !isError && displayedList.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-500 text-xs gap-2">
            <span>No {activeTab} bounties to show.</span>
            {hiddenCount > 0 && (
              <button
                onClick={restoreAll}
                className="text-emerald-500 hover:text-emerald-400 underline underline-offset-2 transition-colors"
              >
                Restore hidden bounties
              </button>
            )}
          </div>
        )}

        {mounted && !isLoading && !isError && displayedList.length > 0 && (
          <div className="space-y-2">
            {displayedList.map((b) => {
              const status = getBountyStatus(b, nowSeconds);
              const meta = STATUS_META[status];
              const isSelected = selectedId === b.id;

              return (
                <button
                  key={b.id.toString()}
                  onClick={() => onSelect(b.id)}
                  className={`w-full rounded-xl p-3.5 text-left border transition-all duration-300 flex items-start justify-between gap-3 ${
                    isSelected
                      ? "bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                      : "bg-zinc-950/40 border-white/5 hover:border-white/10 hover:bg-zinc-900/40"
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-zinc-500">#{b.id.toString()}</span>
                      <h3 className="text-sm font-medium text-zinc-200 truncate">{b.title}</h3>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      <span className="text-xs text-zinc-500">
                        {b.submissionCount.toString()} revealed submission{b.submissionCount !== 1n ? "s" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-semibold text-emerald-400 font-mono">
                      {formatReward(b.reward)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
