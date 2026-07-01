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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  // ==== Private keys ====
  const key1 = process.env.DEPLOYER_PRIVATE_KEY; // Owner (creates bounty)
  const key2 = process.env.SUBMITTER_PRIVATE_KEY; // Submitter (commits + reveals)

  const ownerAccount = privateKeyToAccount(key1);
  const submitterAccount = privateKeyToAccount(key2);

  console.log("=".repeat(60));
  console.log("  RITUAL BOUNTY: IS RITUAL LAYER 1 BLOCKCHAIN?");
  console.log("=".repeat(60));
  console.log("Owner  Wallet:", ownerAccount.address);
  console.log("Submitter Wallet:", submitterAccount.address);

  const contractAddress = "0xa7b186888d6cecdd91049549e62817d68269308d" as `0x${string}`;
  const ritualWalletAddress = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948" as `0x${string}`;

  // ---- Check balances ----
  const ownerBal = await client.getBalance({ address: ownerAccount.address });
  const submitterBal = await client.getBalance({ address: submitterAccount.address });
  console.log(`\nOwner balance:     ${formatEther(ownerBal)} RITUAL`);
  console.log(`Submitter balance: ${formatEther(submitterBal)} RITUAL`);

  if (ownerBal < parseEther("0.02")) {
    throw new Error(`Owner balance too low: ${formatEther(ownerBal)} RITUAL. Need at least 0.02.`);
  }

  // ---- Check/Fund RitualWallet for owner ----
  const ritualWalletAbi = [
    { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: process.env.DEPLOYER_PRIVATE_KEY, type: "uint256" }] },
    { name: "lockUntil", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: process.env.DEPLOYER_PRIVATE_KEY, type: "uint256" }] },
    { name: "deposit",   type: "function", stateMutability: "payable", inputs: [{ name: "lockDuration", type: "uint256" }], outputs: [] },
  ];

  const ritualBalance = await client.readContract({
    address: ritualWalletAddress,
    abi: ritualWalletAbi,
    functionName: "balanceOf",
    args: [ownerAccount.address],
  }) as bigint;

  const lockUntil = await client.readContract({
    address: ritualWalletAddress,
    abi: ritualWalletAbi,
    functionName: "lockUntil",
    args: [ownerAccount.address],
  }) as bigint;

  const currentBlock = await client.getBlockNumber();
  console.log(`\nRitualWallet balance: ${formatEther(ritualBalance)} RITUAL`);
  console.log(`Lock until block: ${lockUntil.toString()} | Current: ${currentBlock.toString()}`);

  const ownerWalletClient = await viem.getWalletClient(ownerAccount.address);
  const submitterWalletClient = await viem.getWalletClient(submitterAccount.address);

  if (ritualBalance < parseEther("0.05") || lockUntil < currentBlock + 300n) {
    console.log("\nDepositing 0.05 RITUAL to RitualWallet (LLM fees)...");
    const { request } = await client.simulateContract({
      address: ritualWalletAddress,
      abi: ritualWalletAbi,
      functionName: "deposit",
      args: [100000n],
      value: parseEther("0.05"),
      account: ownerAccount,
    });
    const depositHash = await ownerWalletClient.writeContract(request);
    console.log(`Deposit tx: ${depositHash}`);
    await client.waitForTransactionReceipt({ hash: depositHash });
    console.log("Deposit confirmed!");
  } else {
    console.log("RitualWallet already funded — skipping deposit.");
  }

  // ---- Get contract ----
  const aiJudge = await viem.getContractAt("AIJudge", contractAddress);
  const nextBountyId = await aiJudge.read.nextBountyId() as bigint;
  console.log(`\nNext Bounty ID: ${nextBountyId.toString()}`);

  // ---- Detect timestamp format ----
  const block = await client.getBlock();
  const nowTs = block.timestamp;
  const isMs = nowTs > 50_000_000_000n;
  console.log(`Block timestamp: ${nowTs.toString()} (${isMs ? "milliseconds" : "seconds"})`);

  // ---- Deadlines: 20s commit, 40s reveal (with ms offset if needed) ----
  const subOffset = isMs ? 20_000n : 20n;
  const revOffset = isMs ? 40_000n : 40n;
  const submissionDeadline = nowTs + subOffset;
  const revealDeadline = nowTs + revOffset;

  // ==== STEP 1: CREATE BOUNTY ====
  console.log("\n" + "─".repeat(60));
  console.log("STEP 1: Creating bounty...");
  console.log("─".repeat(60));
  const createTx = await ownerWalletClient.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "createBounty",
    args: [
      "Is Ritual Layer 1 blockchain",
      "Answer with yes or no whether Ritual is a Layer 1 blockchain.",
      submissionDeadline,
      revealDeadline,
    ],
    value: parseEther("0.01"),
    account: ownerAccount,
    gas: 1_000_000n,
  });
  console.log(`Create bounty tx: ${createTx}`);
  const createReceipt = await client.waitForTransactionReceipt({ hash: createTx });
  if (createReceipt.status === "reverted") {
    throw new Error(`createBounty reverted! Hash: ${createTx}`);
  }
  console.log(`✅ Bounty #${nextBountyId} created successfully!`);

  // ==== STEP 2: SUBMIT COMMITMENT ====
  console.log("\n" + "─".repeat(60));
  console.log("STEP 2: Submitting commitment (answer: 'yes')...");
  console.log("─".repeat(60));
  const answer = "yes";
  const salt = generateSalt();
  const commitment = computeCommitment(answer, salt, submitterAccount.address, nextBountyId);

  console.log(`Answer:     ${answer}`);
  console.log(`Salt:       ${salt}`);
  console.log(`Commitment: ${commitment}`);

  const commitTx = await submitterWalletClient.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "submitCommitment",
    args: [nextBountyId, commitment],
    account: submitterAccount,
    gas: 500_000n,
  });
  console.log(`Commit tx: ${commitTx}`);
  const commitReceipt = await client.waitForTransactionReceipt({ hash: commitTx });
  if (commitReceipt.status === "reverted") {
    throw new Error(`submitCommitment reverted! Hash: ${commitTx}`);
  }
  console.log("✅ Commitment submitted successfully!");

  // ==== STEP 3: WAIT FOR SUBMISSION DEADLINE ====
  console.log("\n" + "─".repeat(60));
  console.log("STEP 3: Waiting for submission deadline to pass...");
  console.log("─".repeat(60));
  while (true) {
    const b = await client.getBlock();
    const ts = b.timestamp;
    if (ts >= submissionDeadline) {
      console.log(`✅ Submission deadline passed! (ts: ${ts}, deadline: ${submissionDeadline})`);
      break;
    }
    const diff = isMs ? Number(submissionDeadline - ts) / 1000 : Number(submissionDeadline - ts);
    console.log(`Waiting... ${diff.toFixed(1)}s remaining`);
    await sleep(2000);
  }

  // ==== STEP 4: REVEAL ANSWER ====
  console.log("\n" + "─".repeat(60));
  console.log("STEP 4: Revealing answer...");
  console.log("─".repeat(60));
  const revealTx = await submitterWalletClient.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "revealAnswer",
    args: [nextBountyId, answer, salt],
    account: submitterAccount,
    gas: 500_000n,
  });
  console.log(`Reveal tx: ${revealTx}`);
  const revealReceipt = await client.waitForTransactionReceipt({ hash: revealTx });
  if (revealReceipt.status === "reverted") {
    throw new Error(`revealAnswer reverted! Hash: ${revealTx}`);
  }
  console.log(`✅ Answer revealed: "${answer}"`);

  // ==== STEP 5: WAIT FOR REVEAL DEADLINE ====
  console.log("\n" + "─".repeat(60));
  console.log("STEP 5: Waiting for reveal deadline to pass...");
  console.log("─".repeat(60));
  while (true) {
    const b = await client.getBlock();
    const ts = b.timestamp;
    if (ts >= revealDeadline) {
      console.log(`✅ Reveal deadline passed! (ts: ${ts}, deadline: ${revealDeadline})`);
      break;
    }
    const diff = isMs ? Number(revealDeadline - ts) / 1000 : Number(revealDeadline - ts);
    console.log(`Waiting... ${diff.toFixed(1)}s remaining`);
    await sleep(2000);
  }

  // ==== STEP 6: JUDGE (MOCK) ====
  console.log("\n" + "─".repeat(60));
  console.log("STEP 6: Owner judging all answers (mock AI review)...");
  console.log("─".repeat(60));
  const mockReview = JSON.stringify({
    winnerIndex: 0,
    ranking: [
      {
        index: 0,
        score: 100,
        reason: "Yes — Ritual is indeed a Layer 1 blockchain with its own execution environment.",
      },
    ],
    summary: "Ritual IS a Layer 1 blockchain. The answer 'yes' is correct.",
  });
  const mockReviewBytes = stringToHex(mockReview) as `0x${string}`;
  console.log(`Mock review: ${mockReview}`);

  const judgeTx = await ownerWalletClient.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "judgeAllMock",
    args: [nextBountyId, mockReviewBytes],
    account: ownerAccount,
    gas: 1_500_000n,
  });
  console.log(`Judge tx: ${judgeTx}`);
  const judgeReceipt = await client.waitForTransactionReceipt({ hash: judgeTx });
  if (judgeReceipt.status === "reverted") {
    throw new Error(`judgeAllMock reverted! Hash: ${judgeTx}`);
  }
  console.log("✅ Mock judging completed!");

  // ==== STEP 7: FINALIZE WINNER ====
  console.log("\n" + "─".repeat(60));
  console.log("STEP 7: Finalizing winner (index 0)...");
  console.log("─".repeat(60));
  const finalizeTx = await ownerWalletClient.writeContract({
    address: contractAddress,
    abi: aiJudge.abi,
    functionName: "finalizeWinner",
    args: [nextBountyId, 0n],
    account: ownerAccount,
    gas: 500_000n,
  });
  console.log(`Finalize tx: ${finalizeTx}`);
  const finalizeReceipt = await client.waitForTransactionReceipt({ hash: finalizeTx });
  if (finalizeReceipt.status === "reverted") {
    throw new Error(`finalizeWinner reverted! Hash: ${finalizeTx}`);
  }

  // ---- Post-finalization balance check ----
  const submitterBalAfter = await client.getBalance({ address: submitterAccount.address });
  console.log("\n" + "=".repeat(60));
  console.log(`🏆 BOUNTY #${nextBountyId} COMPLETE!`);
  console.log("=".repeat(60));
  console.log(`Bounty title:  "Is Ritual Layer 1 blockchain"`);
  console.log(`Winning answer: "${answer}"`);
  console.log(`Winner:         ${submitterAccount.address}`);
  console.log(`Reward:         0.01 RITUAL paid out`);
  console.log(`Submitter balance after: ${formatEther(submitterBalAfter)} RITUAL`);
  console.log(`\nTx Hashes:`);
  console.log(`  Create bounty:       ${createTx}`);
  console.log(`  Submit commitment:   ${commitTx}`);
  console.log(`  Reveal answer:       ${revealTx}`);
  console.log(`  Judge (mock):        ${judgeTx}`);
  console.log(`  Finalize winner:     ${finalizeTx}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("\n❌ FAILED:", err.message || err);
  process.exit(1);
});
