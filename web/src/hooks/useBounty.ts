"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import aiJudgeAbi from "@/abi/AIJudge";
import { contractAddress, isContractConfigured } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import { parseBounty, type Bounty } from "@/lib/bounty";

/** Read + parse a single bounty, polling every 12 s so phase banners flip on time. */
export function useBounty(bountyId?: bigint) {
  const publicClient = usePublicClient({ chainId: ritualChain.id });
  const enabled = bountyId !== undefined && isContractConfigured && !!publicClient;

  const query = useQuery({
    queryKey: ["bounty", contractAddress, bountyId?.toString()],
    queryFn: async () => {
      if (!contractAddress || !publicClient || bountyId === undefined) return undefined;
      const raw = await publicClient.readContract({
        address: contractAddress,
        abi: aiJudgeAbi,
        functionName: "getBounty",
        args: [bountyId],
      });
      return parseBounty(
        raw as readonly [
          `0x${string}`,
          string,
          string,
          bigint,
          bigint,
          bigint,
          boolean,
          boolean,
          bigint,
          bigint,
          `0x${string}`,
        ],
      );
    },
    enabled,
    refetchInterval: 12_000,
    retry: 2,
  });

  return {
    bounty: query.data as Bounty | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
