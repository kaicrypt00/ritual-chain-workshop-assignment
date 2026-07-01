/**
 * Diagnostics script: checks Ritual chain connectivity, timestamp format,
 * contract existence, account balances, and attempts a live getBounty read.
 */
import hre from "hardhat";
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const key2 = process.env.SUBMITTER_PRIVATE_KEY;

  const owner = privateKeyToAccount(key1);
  const submitter = privateKeyToAccount(key2);

  const contractAddress = "0xa7b186888d6cecdd91049549e62817d68269308d" as `0x${string}`;

  console.log("=".repeat(60));
  console.log("RITUAL CHAIN DIAGNOSTICS");
  console.log("=".repeat(60));

  // 1. Chain ID
  const chainId = await client.getChainId();
  console.log(`\nChain ID: ${chainId}`);

  // 2. Block number
  const blockNumber = await client.getBlockNumber();
  console.log(`Block number: ${blockNumber}`);

  // 3. Block timestamp (key: seconds or ms?)
  const block = await client.getBlock();
  const ts = block.timestamp;
  const isMs = ts > 50_000_000_000n;
  console.log(`\nBlock timestamp: ${ts.toString()}`);
  console.log(`Timestamp format: ${isMs ? "MILLISECONDS" : "SECONDS"}`);

  // Sanity check — convert to wall clock
  const wallClock = isMs ? new Date(Number(ts)) : new Date(Number(ts) * 1000);
  console.log(`Wall clock:       ${wallClock.toISOString()}`);

  // 4. Account balances
  const ownerBal = await client.getBalance({ address: owner.address });
  const submitterBal = await client.getBalance({ address: submitter.address });
  console.log(`\nKey1 (owner)     ${owner.address}: ${formatEther(ownerBal)} RITUAL`);
  console.log(`Key2 (submitter) ${submitter.address}: ${formatEther(submitterBal)} RITUAL`);

  // 5. Contract existence
  const code = await client.getBytecode({ address: contractAddress });
  const hasCode = code && code !== "0x";
  console.log(`\nContract ${contractAddress}`);
  console.log(`  Has bytecode: ${hasCode ? "YES ✅" : "NO ❌"}`);

  if (!hasCode) {
    console.log("\n❌ CRITICAL: Contract has no code at that address on this network!");
    return;
  }

  // 6. Read nextBountyId
  const aiJudgeAbi = [
    {
      name: "nextBountyId",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [{ name: process.env.DEPLOYER_PRIVATE_KEY, type: "uint256" }],
    },
    {
      name: "getBounty",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "bountyId", type: "uint256" }],
      outputs: [
        { name: "owner", type: "address" },
        { name: "title", type: "string" },
        { name: "rubric", type: "string" },
        { name: "reward", type: "uint256" },
        { name: "submissionDeadline", type: "uint256" },
        { name: "revealDeadline", type: "uint256" },
        { name: "judged", type: "bool" },
        { name: "finalized", type: "bool" },
        { name: "submissionCount", type: "uint256" },
        { name: "winnerIndex", type: "uint256" },
        { name: "aiReview", type: "bytes" },
      ],
    },
  ] as const;

  const nextId = await client.readContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "nextBountyId",
    args: [],
  }) as bigint;
  console.log(`  nextBountyId:  ${nextId} (${nextId - 1n} bounties created so far)`);

  // 7. Read the latest bounty
  if (nextId > 1n) {
    const latestId = nextId - 1n;
    const bounty = await client.readContract({
      address: contractAddress,
      abi: aiJudgeAbi,
      functionName: "getBounty",
      args: [latestId],
    }) as any;
    const [bOwner, bTitle, , bReward, bSubDeadline, bRevDeadline, bJudged, bFinalized, bCount] = bounty;
    const subDeadlineStr = isMs
      ? new Date(Number(bSubDeadline)).toISOString()
      : new Date(Number(bSubDeadline) * 1000).toISOString();
    const revDeadlineStr = isMs
      ? new Date(Number(bRevDeadline)).toISOString()
      : new Date(Number(bRevDeadline) * 1000).toISOString();

    console.log(`\n  Latest bounty #${latestId}:`);
    console.log(`    Title:              "${bTitle}"`);
    console.log(`    Owner:              ${bOwner}`);
    console.log(`    Reward:             ${formatEther(bReward as bigint)} RITUAL`);
    console.log(`    Sub deadline:       ${bSubDeadline} → ${subDeadlineStr}`);
    console.log(`    Rev deadline:       ${bRevDeadline} → ${revDeadlineStr}`);
    console.log(`    Judged/Finalized:   ${bJudged}/${bFinalized}`);
    console.log(`    Submissions:        ${bCount}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("DIAGNOSIS SUMMARY");
  console.log("=".repeat(60));
  console.log(`Chain:          Ritual (${chainId})`);
  console.log(`Timestamp fmt:  ${isMs ? "MILLISECONDS — web app MUST send ms timestamps" : "SECONDS — web app MUST send second timestamps"}`);
  console.log(`Contract:       ${hasCode ? "✅ FOUND" : "❌ NOT FOUND"}`);
  console.log(`Owner balance:  ${formatEther(ownerBal)} RITUAL ${Number(formatEther(ownerBal)) > 0.02 ? "✅" : "❌ LOW!"}`);
  console.log(`Submitter bal:  ${formatEther(submitterBal)} RITUAL`);
}

main().catch((err) => {
  console.error("❌ Diagnostic failed:", err.message || err);
  process.exit(1);
});
