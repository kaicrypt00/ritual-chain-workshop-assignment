"use client";

import { useState, useCallback } from "react";
import { WalletConnect } from "@/components/WalletConnect";
import { CreateBountyForm } from "@/components/CreateBountyForm";
import { BountyListPanel } from "@/components/BountyListPanel";
import { LoadBountyPanel } from "@/components/LoadBountyPanel";
import { BountyView } from "@/components/BountyView";
import { isContractConfigured, contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import { Notice } from "@/components/ui";
import { useRecentBounties } from "@/hooks/useRecentBounties";

export default function Home() {
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const { ids: recentIds, add: addRecent } = useRecentBounties();

  const handleSelect = useCallback((id: bigint | null) => {
    setSelectedId(id);
    if (id !== null) {
      addRecent(id);
    }
  }, [addRecent]);

  const handleCreated = useCallback((id: bigint) => {
    handleSelect(id);
  }, [handleSelect]);

  return (
    <div className="min-h-full">
      {/* Top nav */}
      <header className="sticky top-0 z-10 border-b border-white/5 bg-black/60 backdrop-blur-xl shadow-lg shadow-black/20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="absolute -inset-0.5 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-400 opacity-20 blur group-hover:opacity-40 transition duration-300"></div>
              <img
                src="/ritual-logo.png"
                alt="Ritual Logo"
                className="relative h-8 w-8 rounded-lg object-cover border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.15)] bg-black"
              />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wider leading-tight text-white uppercase">
                Ritual Bounty Judge
              </h1>
              <p className="text-[10px] font-mono leading-tight text-emerald-400 font-semibold tracking-wider">
                on {ritualChain.name.toUpperCase()}
              </p>
            </div>
          </div>
          <WalletConnect />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Hero */}
        <section className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
            Crowd-judged bounties, settled by{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-emerald-500 bg-clip-text text-transparent">
              Ritual AI
            </span>
            .
          </h2>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Submit answers to a bounty. After the deadline, Ritual AI ranks all submissions. The
            bounty owner finalizes the winner.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-950/20 border border-emerald-500/10 px-3.5 py-1.5 text-emerald-400 font-medium">
              AI review is advisory. The owner finalizes the winner.
            </span>
            <span className="rounded-full bg-emerald-950/20 border border-emerald-500/10 px-3.5 py-1.5 text-emerald-400 font-medium">
              All submissions are judged together after the deadline.
            </span>
            <span className="rounded-full bg-emerald-950/20 border border-emerald-500/10 px-3.5 py-1.5 text-emerald-400 font-medium">
              Only one winner receives the bounty reward.
            </span>
          </div>
        </section>

        {!isContractConfigured && (
          <div className="mb-6">
            <Notice tone="amber">
              No contract address configured. Set{" "}
              <code className="font-mono">NEXT_PUBLIC_CONTRACT_ADDRESS</code> in{" "}
              <code className="font-mono">.env.local</code> to enable on-chain interactions.
            </Notice>
          </div>
        )}

        {/* Dashboard: create + bounty list */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CreateBountyForm onCreated={handleCreated} />
          <div className="space-y-4">
            <LoadBountyPanel
              selectedId={selectedId}
              onSelect={handleSelect}
              recentIds={recentIds}
            />
            <BountyListPanel selectedId={selectedId} onSelect={handleSelect} />
          </div>
        </section>

        {/* Selected bounty detail */}
        {selectedId !== null && (
          <section className="mt-6">
            <BountyView bountyId={selectedId} />
          </section>
        )}

        <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-zinc-600">
          {contractAddress ? (
            <>
              Contract <span className="font-mono">{shortenAddress(contractAddress, 6)}</span> ·
              Chain {ritualChain.id}
            </>
          ) : (
            <>Workshop demo · {ritualChain.name}</>
          )}
        </footer>
      </main>
    </div>
  );
}
