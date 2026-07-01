import hre from "hardhat";
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const ownerAccount = privateKeyToAccount(key1);

  const contractAddress = "0xa7b186888d6cecdd91049549e62817d68269308d";
  const aiJudge = await viem.getContractAt("AIJudge", contractAddress);

  const nextBountyId = await aiJudge.read.nextBountyId() as bigint;
  const lastBountyId = nextBountyId - 1n;

  const block = await client.getBlock();
  console.log(`\nCurrent block: ${block.number}`);
  console.log(`Current block.timestamp: ${block.timestamp}`);
  console.log(`Checking bounties from 1 to ${lastBountyId}...\n`);

  for (let id = 1n; id <= lastBountyId; id++) {
    try {
      const [owner, title, rubric, reward, subDeadline, revDeadline, judged, finalized, subCount, winnerIndex, aiReview] =
        await aiJudge.read.getBounty([id]) as any;

      console.log(`=== Bounty ${id} ===`);
      console.log(`  Owner:              ${owner}`);
      console.log(`  Title:              ${title}`);
      console.log(`  Reward:             ${formatEther(reward)} RITUAL`);
      console.log(`  Submission Deadline:${subDeadline.toString()}`);
      console.log(`  Reveal Deadline:    ${revDeadline.toString()}`);
      console.log(`  Current Timestamp:  ${block.timestamp.toString()}`);
      console.log(`  Submission phase over? ${block.timestamp >= subDeadline ? "YES" : "NO"}`);
      console.log(`  Reveal phase over?  ${block.timestamp >= revDeadline ? "YES" : "NO"}`);
      console.log(`  Submissions count:  ${subCount.toString()}`);
      console.log(`  Judged:             ${judged}`);
      console.log(`  Finalized:          ${finalized}`);
      console.log(`  Winner Index:       ${winnerIndex.toString()}`);
      if (aiReview && aiReview.length > 2) {
        try {
          const reviewText = Buffer.from(aiReview.slice(2), "hex").toString("utf8");
          console.log(`  AI Review:          ${reviewText}`);
        } catch {
          console.log(`  AI Review (hex):    ${aiReview}`);
        }
      }

      if (Number(subCount) > 0) {
        for (let j = 0n; j < subCount; j++) {
          const [submitter, answer, commitment, revealed] = await aiJudge.read.getSubmission([id, j]) as any;
          console.log(`  Submission[${j}]:     submitter=${submitter}, revealed=${revealed}`);
          console.log(`    Answer: ${answer.substring(0, 80)}...`);
        }
      }
      console.log();
    } catch (e: any) {
      console.log(`Bounty ${id}: error - ${e.message}`);
    }
  }
}

main().catch(console.error);
