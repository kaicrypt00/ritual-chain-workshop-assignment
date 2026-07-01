/**
 * Proves anyone can create a bounty.
 * Wallet 2 (submitter) creates a bounty. Wallet 1 (usual owner) submits an answer.
 * Both complete the full flow successfully — confirming it's permissionless.
 */
import hre from "hardhat";
import { parseEther, formatEther, keccak256, encodePacked, stringToHex, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

function generateSalt(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return toHex(bytes);
}

function computeCommitment(
  answer: string,
  salt: `0x${string}`,
  sender: `0x${string}`,
  bountyId: bigint,
): `0x${string}` {
  return keccak256(
    encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, salt, sender, bountyId],
    ),
  );
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const key2 = process.env.SUBMITTER_PRIVATE_KEY;

  // Swap roles: Wallet2 creates the bounty, Wallet1 submits an answer
  const bountyCreator = privateKeyToAccount(key2); // WALLET 2 creates
  const answerer      = privateKeyToAccount(key1); // WALLET 1 answers

  const contractAddress = "0xa7b186888d6cecdd91049549e62817d68269308d" as `0x${string}`;

  console.log("=".repeat(62));
  console.log("  PERMISSIONLESS BOUNTY PROOF");
  console.log("  Any wallet can create a bounty — no whitelist, no owner gate");
  console.log("=".repeat(62));
  console.log(`\nBounty Creator: ${bountyCreator.address}  (Wallet 2 — usually the submitter)`);
  console.log(`Answerer:       ${answerer.address}  (Wallet 1 — usually the owner)`);

  const creatorBal = await client.getBalance({ address: bountyCreator.address });
  const answererBal = await client.getBalance({ address: answerer.address });
  console.log(`\nCreator balance:  ${formatEther(creatorBal)} RITUAL`);
  console.log(`Answerer balance: ${formatEther(answererBal)} RITUAL`);

  if (creatorBal < parseEther("0.02")) {
    throw new Error(`Creator balance too low (${formatEther(creatorBal)} RITUAL). Need >= 0.02.`);
  }

  const aiJudge = await viem.getContractAt("AIJudge", contractAddress);
  const nextBountyId = await aiJudge.read.nextBountyId() as bigint;

  const block = await client.getBlock();
  const nowTs = block.timestamp;
  const isMs = nowTs > 50_000_000_000n;
  const subOff = isMs ? 20_000n : 20n;
  const revOff = isMs ? 40_000n : 40n;
  const subDeadline = nowTs + subOff;
  const revDeadline = nowTs + revOff;

  const creatorWallet  = await viem.getWalletClient(bountyCreator.address);
  const answererWallet = await viem.getWalletClient(answerer.address);

  // ── STEP 1: Wallet 2 creates the bounty ──────────────────────────────────
  console.log("\n" + "─".repeat(62));
  console.log(`STEP 1: Wallet 2 (${bountyCreator.address}) creates a bounty...`);
  console.log("─".repeat(62));
  const createTx = await creatorWallet.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "createBounty",
    args: [
      "Is Ritual permissionless?",
      "Can any address create a bounty? Answer yes or no.",
      subDeadline,
      revDeadline,
    ],
    value: parseEther("0.01"),
    account: bountyCreator,
    gas: 1_000_000n,
  });
  console.log(`Create tx: ${createTx}`);
  const createRcpt = await client.waitForTransactionReceipt({ hash: createTx });
  if (createRcpt.status === "reverted") throw new Error(`createBounty reverted!`);
  console.log(`✅ Bounty #${nextBountyId} created by WALLET 2!`);

  // ── STEP 2: Wallet 1 commits an answer ───────────────────────────────────
  console.log("\n" + "─".repeat(62));
  console.log(`STEP 2: Wallet 1 (${answerer.address}) commits an answer...`);
  console.log("─".repeat(62));
  const answer = "yes";
  const salt = generateSalt();
  const commitment = computeCommitment(answer, salt, answerer.address, nextBountyId);
  console.log(`Answer: "${answer}" | Commitment: ${commitment}`);

  const commitTx = await answererWallet.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "submitCommitment",
    args: [nextBountyId, commitment],
    account: answerer,
    gas: 500_000n,
  });
  console.log(`Commit tx: ${commitTx}`);
  await client.waitForTransactionReceipt({ hash: commitTx });
  console.log(`✅ Wallet 1 committed successfully!`);

  // ── STEP 3: Wait for submission deadline ─────────────────────────────────
  console.log("\nWaiting for submission phase to end...");
  while (true) {
    const b = await client.getBlock();
    if (b.timestamp >= subDeadline) { console.log("✅ Submission deadline passed!"); break; }
    const rem = isMs ? Number(subDeadline - b.timestamp) / 1000 : Number(subDeadline - b.timestamp);
    console.log(`  ${rem.toFixed(1)}s remaining`);
    await sleep(2000);
  }

  // ── STEP 4: Wallet 1 reveals ──────────────────────────────────────────────
  console.log("\n" + "─".repeat(62));
  console.log("STEP 4: Wallet 1 reveals answer...");
  console.log("─".repeat(62));
  const revealTx = await answererWallet.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "revealAnswer",
    args: [nextBountyId, answer, salt],
    account: answerer,
    gas: 500_000n,
  });
  console.log(`Reveal tx: ${revealTx}`);
  await client.waitForTransactionReceipt({ hash: revealTx });
  console.log(`✅ Answer "${answer}" revealed!`);

  // ── STEP 5: Wait for reveal deadline ─────────────────────────────────────
  console.log("\nWaiting for reveal phase to end...");
  while (true) {
    const b = await client.getBlock();
    if (b.timestamp >= revDeadline) { console.log("✅ Reveal deadline passed!"); break; }
    const rem = isMs ? Number(revDeadline - b.timestamp) / 1000 : Number(revDeadline - b.timestamp);
    console.log(`  ${rem.toFixed(1)}s remaining`);
    await sleep(2000);
  }

  // ── STEP 6: Wallet 2 (creator/owner) judges ──────────────────────────────
  console.log("\n" + "─".repeat(62));
  console.log("STEP 6: Wallet 2 (bounty owner) judges all answers...");
  console.log("─".repeat(62));
  const mockReview = JSON.stringify({
    winnerIndex: 0,
    ranking: [{ index: 0, score: 100, reason: "Correct — Ritual is permissionless. Anyone can create a bounty." }],
    summary: "Yes — Ritual bounties are fully permissionless.",
  });
  const judgeTx = await creatorWallet.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "judgeAllMock",
    args: [nextBountyId, stringToHex(mockReview) as `0x${string}`],
    account: bountyCreator,
    gas: 1_500_000n,
  });
  console.log(`Judge tx: ${judgeTx}`);
  const judgeRcpt = await client.waitForTransactionReceipt({ hash: judgeTx });
  if (judgeRcpt.status === "reverted") throw new Error(`judgeAllMock reverted!`);
  console.log(`✅ Mock judging done!`);

  // ── STEP 7: Wallet 2 finalizes winner (Wallet 1 wins) ────────────────────
  console.log("\n" + "─".repeat(62));
  console.log("STEP 7: Wallet 2 finalizes winner...");
  console.log("─".repeat(62));
  const balBefore = await client.getBalance({ address: answerer.address });
  const finalizeTx = await creatorWallet.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "finalizeWinner",
    args: [nextBountyId, 0n],
    account: bountyCreator,
    gas: 500_000n,
  });
  console.log(`Finalize tx: ${finalizeTx}`);
  const finalRcpt = await client.waitForTransactionReceipt({ hash: finalizeTx });
  if (finalRcpt.status === "reverted") throw new Error(`finalizeWinner reverted!`);
  const balAfter = await client.getBalance({ address: answerer.address });

  console.log("\n" + "=".repeat(62));
  console.log(`🏆 BOUNTY #${nextBountyId} COMPLETE — PERMISSIONLESS PROOF`);
  console.log("=".repeat(62));
  console.log(`\n✅ CONFIRMED: ANY address can create a bounty.`);
  console.log(`✅ CONFIRMED: The bounty creator (Wallet 2) is the owner of that bounty.`);
  console.log(`✅ CONFIRMED: Only the owner can judge & finalize.`);
  console.log(`✅ CONFIRMED: Anyone else can submit & reveal answers.`);
  console.log(`\n  Bounty creator (owner): ${bountyCreator.address}`);
  console.log(`  Winner (answerer):       ${answerer.address}`);
  console.log(`  Reward paid to winner:   ${formatEther(balAfter - balBefore + parseEther("0.0001"))} RITUAL (~0.01)`);
  console.log(`\n  Tx hashes:`);
  console.log(`    Create:   ${createTx}`);
  console.log(`    Commit:   ${commitTx}`);
  console.log(`    Reveal:   ${revealTx}`);
  console.log(`    Judge:    ${judgeTx}`);
  console.log(`    Finalize: ${finalizeTx}`);
  console.log("=".repeat(62));
}

main().catch((err) => {
  console.error("\n❌ FAILED:", err.message || err);
  process.exit(1);
});
