/**
 * Simulate judgeAll for bounty 9 (already judged=false, reveal done)
 * to get the actual on-chain revert reason.
 */
import hre from "hardhat";
import {
  encodeAbiParameters,
  parseAbiParameters,
  decodeErrorResult,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

function buildLlmInput(executorAddress: `0x${string}`, messagesJson: string): `0x${string}` {
  const llmParams = parseAbiParameters(
    "address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)",
  );
  return encodeAbiParameters(llmParams, [
    executorAddress,
    [],
    300n,
    [],
    "0x",
    messagesJson,
    "zai-org/GLM-4.7-FP8",
    0n,
    process.env.DEPLOYER_PRIVATE_KEY,
    false,
    8192n,
    process.env.DEPLOYER_PRIVATE_KEY,
    process.env.DEPLOYER_PRIVATE_KEY,
    1n,
    false,
    0n,
    process.env.DEPLOYER_PRIVATE_KEY,
    "0x",
    -1n,
    process.env.DEPLOYER_PRIVATE_KEY,
    process.env.DEPLOYER_PRIVATE_KEY,
    false,
    100n,
    "0x",
    "0x",
    -1n,
    1000n,
    process.env.DEPLOYER_PRIVATE_KEY,
    false,
    ["gcs", "convos/session.jsonl", "GCS_CREDS"],
  ]);
}

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const ownerAccount = privateKeyToAccount(key1);
  const contractAddress = "0xa7b186888d6cecdd91049549e62817d68269308d" as `0x${string}`;
  const executorAddress = "0xB42e435c4252A5a2E7440e37B609F00c61a0c91B" as `0x${string}`;
  const bountyId = 9n;

  const aiJudge = await viem.getContractAt("AIJudge", contractAddress);

  // Read bounty state
  const bountyData = await aiJudge.read.getBounty([bountyId]) as readonly any[];
  console.log("Bounty #9:");
  console.log("  judged   :", bountyData[6]);
  console.log("  finalized:", bountyData[7]);
  console.log("  subCount :", Number(bountyData[8]));
  console.log("  revDeadline:", bountyData[5].toString());

  const cur = (await client.getBlock()).timestamp;
  console.log("  current ts:", cur.toString());
  console.log("  reveal passed:", cur >= bountyData[5]);

  if (bountyData[6]) {
    console.log("\n⚠️  Bounty #9 is already judged — checking a different bounty...");
    // Try to find a unjudged bounty
    const nextId = await aiJudge.read.nextBountyId() as bigint;
    for (let i = 0n; i < nextId; i++) {
      const b = await aiJudge.read.getBounty([i]) as readonly any[];
      if (!b[6] && Number(b[8]) > 0) {
        console.log(`\nFound unjudged bounty #${i} with ${Number(b[8])} submissions`);
        break;
      }
    }
    return;
  }

  const messages = JSON.stringify([
    { role: "system", content: "You are an impartial bounty judge. Return only JSON: {\"winnerIndex\":0,\"summary\":\"ok\"}" },
    { role: "user",   content: "Judge submission 0: good answer. Rubric: explain Ritual." },
  ]);

  const llmInput = buildLlmInput(executorAddress, messages);
  console.log("\nllmInput length (bytes):", (llmInput.length - 2) / 2);

  // Simulate the call and get revert reason
  try {
    const sim = await client.simulateContract({
      address: contractAddress,
      abi: aiJudge.abi,
      functionName: "judgeAll",
      args: [bountyId, llmInput],
      account: ownerAccount,
    });
    console.log("\n✅ Simulation SUCCEEDED:", sim.result);
  } catch (e: any) {
    console.log("\n❌ Simulation FAILED:");
    console.log("  shortMessage:", e.shortMessage);
    console.log("  message     :", e.message?.slice(0, 300));
    if (e.cause?.data) console.log("  revert data :", e.cause.data);
    if (e.cause?.reason) console.log("  reason      :", e.cause.reason);
  }

  // Also try calling judgeAll via eth_call to get raw revert bytes
  try {
    const { encodeFunctionData } = await import("viem");
    const callData = encodeFunctionData({
      abi: aiJudge.abi,
      functionName: "judgeAll",
      args: [bountyId, llmInput],
    });
    const result = await client.call({
      to: contractAddress,
      data: callData,
      account: ownerAccount,
    });
    console.log("\neth_call result:", result.data?.slice(0, 200));
  } catch (e: any) {
    console.log("\neth_call revert:", e.shortMessage || e.message?.slice(0, 200));
  }
}

main().catch(console.error);
