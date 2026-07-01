"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress, isContractConfigured } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { parseBounty, type Bounty } from "@/lib/bounty";

export type BountyWithId = Bounty & { id: bigint };

/** Reads all bounties on the contract by first querying nextBountyId. */
export function useAllBounties() {
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const enabled = isContractConfigured;

  // 1. Fetch nextBountyId using publicClient to avoid missing Multicall3 contract
  const nextIdQuery = useQuery({
    queryKey: ["nextBountyId", contractAddress],
    queryFn: async () => {
      const addr = contractAddress;
      if (!addr || !publicClient) return 1n;
      const res = await publicClient.readContract({
        address: addr,
        abi: aiJudgeAbi,
        functionName: "nextBountyId",
      });
      return BigInt(res as bigint);
    },
    enabled: enabled && !!publicClient,
    refetchInterval: 15_000,
    retry: 2,
  });

  const nextBountyId = nextIdQuery.data ?? 1n;
  const count = Number(nextBountyId - 1n);

  // 2. Fetch all bounties individually in parallel using Promise.all to bypass Multicall3
  const bountiesQuery = useQuery({
    queryKey: ["allBounties", contractAddress, count],
    queryFn: async () => {
      const addr = contractAddress;
      if (!addr || !publicClient || count <= 0) return [];
      const promises = Array.from({ length: count }, async (_, i) => {
        const id = BigInt(i + 1);
        try {
          const raw = await publicClient.readContract({
            address: addr,
            abi: aiJudgeAbi,
            functionName: "getBounty",
            args: [id],
          }) as readonly [`0x${string}`, string, string, bigint, bigint, bigint, boolean, boolean, bigint, bigint, `0x${string}`];
          const parsed = parseBounty(raw);
          return { ...parsed, id };
        } catch (e) {
          console.error("Failed to parse bounty", id, e);
          return null;
        }
      });
      const results = await Promise.all(promises);
      return results.filter((b): b is BountyWithId => b !== null);
    },
    enabled: enabled && !!publicClient && count > 0,
    refetchInterval: 15_000,
    retry: 2,
  });

  const isLoading = nextIdQuery.isLoading || (count > 0 && bountiesQuery.isLoading);
  const isError = nextIdQuery.isError || bountiesQuery.isError;
  const error = nextIdQuery.error || bountiesQuery.error;

  return {
    bounties: bountiesQuery.data ?? [],
    isLoading,
    isError,
    error,
    refetch: () => {
      void nextIdQuery.refetch();
      void bountiesQuery.refetch();
    },
  };
}
