import { useCallback, useEffect, useRef, useState } from "react";
import { useWriteContract, useAccount, useSwitchChain, usePublicClient } from "wagmi";
import type { Abi, Address, TransactionReceipt } from "viem";
import { ritualChainId, ritualRpcUrl } from "@/config/contract";

// Ritual Chain only supports EIP-1559 (type-2) txs.
// baseFeePerGas on Ritual is ~7 wei — MetaMask auto-computes maxFeePerGas=14 wei
// which is far below the required ~1 gwei minimum, so txs are silently dropped.
// We always force maxFeePerGas = 2gwei to guarantee acceptance regardless of baseFee.
const RITUAL_MAX_FEE_PER_GAS      = 2_000_000_000n; // 2 gwei
const RITUAL_PRIORITY_FEE_PER_GAS = 1_000_000_000n; // 1 gwei

// Force MetaMask to re-probe Ritual Chain and recognise EIP-1559 support.
// wallet_addEthereumChain updates the chain config if the chain is already present.
async function ensureRitualChainInWallet() {
  const eth = (window as unknown as { ethereum?: { request: (a: unknown) => Promise<unknown> } }).ethereum;
  if (!eth) return;
  try {
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: `0x${ritualChainId.toString(16)}`,
        chainName: "Ritual Chain",
        nativeCurrency: { name: "Ritual", symbol: "RITUAL", decimals: 18 },
        rpcUrls: [ritualRpcUrl],
        blockExplorerUrls: ["https://explorer.ritualfoundation.org"],
      }],
    });
  } catch { /* chain already added — ignore */ }
}

type WriteParams = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
  chainId?: number;
  gas?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: undefined; 
};

type WagmiWriteParams = Parameters<ReturnType<typeof useWriteContract>["writeContractAsync"]>[0];

export type TxState =
  | "idle"
  | "wallet"
  | "pending"
  | "confirmed"
  | "failed";

export type WriteTx = ReturnType<typeof useWriteTx>;

function describeError(err: unknown): string {
  if (!err) return "Transaction failed.";
  const anyErr = err as { shortMessage?: string; message?: string };
  const msg = anyErr.shortMessage || anyErr.message || String(err);
  if (/user rejected|denied|rejected the request/i.test(msg)) {
    return "Request rejected in wallet.";
  }
  return msg.split("\n")[0];
}

/**
 * Wraps wagmi's write hook into a robust state machine:
 * idle → wallet → pending → confirmed | failed.
 *
 * It avoids using the fragile useWaitForTransactionReceipt hook, managing the polling
 * loop manually to ensure slow block times on custom EVM testnets don't abort with
 * false error states.
 */
export function useWriteTx(onConfirmed?: (receipt: TransactionReceipt) => void) {
  const { chainId: walletChainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();

  const {
    data: hash,
    reset: resetWrite,
    isPending: isWalletPending,
    mutateAsync: writeContractAsync,
  } = useWriteContract();

  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!hash || confirmed) return;

    let active = true;
    setConfirming(true);

    const poll = async () => {
      while (active) {
        try {
          if (publicClient) {
            const rec = await publicClient.getTransactionReceipt({ hash });
            if (rec && active) {
              setReceipt(rec);
              setConfirmed(true);
              setConfirming(false);
              break;
            }
          }
        } catch {
        }
        await new Promise((r) => setTimeout(r, 4_000));
      }
    };

    void poll();

    return () => {
      active = false;
    };
  }, [hash, publicClient, confirmed]);

  useEffect(() => {
    if (confirmed && receipt && !notifiedRef.current) {
      notifiedRef.current = true;
      onConfirmed?.(receipt);
    }
  }, [confirmed, receipt, onConfirmed]);

  const state: TxState = submitError
    ? "failed"
    : confirmed
      ? "confirmed"
      : confirming
        ? "pending"
        : submitting || isWalletPending
          ? "wallet"
          : "idle";

  const run = useCallback(
    async (params: WriteParams) => {
      setSubmitError(null);
      notifiedRef.current = false;
      setSubmitting(true);
      setReceipt(null);
      setConfirming(false);
      setConfirmed(false);
      try {
        await ensureRitualChainInWallet();

        if (params.chainId && walletChainId !== params.chainId) {
          try {
            await switchChainAsync({ chainId: params.chainId });
          } catch {
            setSubmitError(
              "Could not switch to the Ritual Chain. Please switch manually in MetaMask, then try again."
            );
            return;
          }
        }

        const { chainId: _stripped, ...paramsNoChainId } = { ...params };

        const paramsWithGas: WriteParams = {
          gas: 1_500_000n,
          maxFeePerGas: RITUAL_MAX_FEE_PER_GAS,
          maxPriorityFeePerGas: RITUAL_PRIORITY_FEE_PER_GAS,
          ...paramsNoChainId,
          gasPrice: undefined,
        };
        return await writeContractAsync(paramsWithGas as WagmiWriteParams);
      } catch (e) {
        setSubmitError(describeError(e));
        throw e;
      } finally {
        setSubmitting(false);
      }
    },
    [writeContractAsync, walletChainId, switchChainAsync],
  );

  const reset = useCallback(() => {
    resetWrite();
    setSubmitError(null);
    notifiedRef.current = false;
    setSubmitting(false);
    setReceipt(null);
    setConfirming(false);
    setConfirmed(false);
  }, [resetWrite]);

  return {
    run,
    reset,
    state,
    hash,
    receipt,
    error: submitError,
    isBusy: state === "wallet" || state === "pending",
    isConfirmed: confirmed,
  };
}
