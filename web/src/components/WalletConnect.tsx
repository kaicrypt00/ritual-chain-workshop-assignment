"use client";

import { useEffect, useRef, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { ritualChain } from "@/config/wagmi";
import { shortenAddress } from "@/lib/format";
import { Button, Badge } from "@/components/ui";

export function WalletConnect() {
  const { address, isConnected, chainId: walletChainId } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Set mounted on client mount to avoid hydration mismatch
  useEffect(() => {
    setTimeout(() => setMounted(true), 0);
  }, []);

  // Close the dropdown when clicking anywhere outside of it
  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const wrongChain =
    isConnected &&
    walletChainId !== undefined &&
    Number(walletChainId) !== Number(ritualChain.id);

  if (!mounted) {
    return (
      <Button>
        Connect Wallet
      </Button>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        {wrongChain ? (
          <Button
            variant="secondary"
            onClick={() => switchChain({ chainId: ritualChain.id })}
          >
            Switch to {ritualChain.name}
          </Button>
        ) : (
          <Badge tone="green">{ritualChain.name}</Badge>
        )}
        <Button variant="secondary" onClick={() => disconnect()}>
          {shortenAddress(address)}
        </Button>
      </div>
    );
  }

  // Dedupe connectors by name (injected + metaMask can overlap).
  const seen = new Set<string>();
  const list = connectors.filter((c) => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Never disable the button itself — clicking it toggles the dropdown
          regardless of isPending, so the user can always open/close it */}
      <Button onClick={() => setOpen((v) => !v)}>
        {isPending ? "Connecting…" : "Connect Wallet"}
      </Button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0e0e12]/98 backdrop-blur-xl shadow-2xl shadow-black/80 ring-1 ring-emerald-500/10"
          style={{ top: "100%" }}
        >
          <div className="px-4 pt-3 pb-2 border-b border-white/5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Select wallet
            </p>
          </div>

          {list.length === 0 && (
            <div className="px-4 py-4 text-xs text-zinc-400 text-center">
              <p className="font-medium">No wallet detected</p>
              <p className="mt-1 text-zinc-600">
                Install MetaMask or another browser wallet extension.
              </p>
            </div>
          )}

          {list.map((connector) => (
            <button
              key={connector.uid}
              onClick={() => {
                connect({ connector });
                setOpen(false);
              }}
              disabled={isPending}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-zinc-300 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500/60 shrink-0" />
              {connector.name}
            </button>
          ))}

          <div className="px-4 py-2.5 border-t border-white/5">
            <p className="text-[10px] text-zinc-600">
              Make sure your wallet is unlocked before connecting.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
