/**
 * Fund the AIJudge contract's RitualWallet so it can pay the TEE executor for LLM inference.
 * Then run the full judgeAll flow with the real LLM precompile.
 */
import hre from "hardhat";
import {
  encodeAbiParameters,
  parseAbiParameters,
  formatEther,
  parseEther,
  keccak256,
  encodePacked,
  hexToString,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACT_ADDRESS = "0x04914ef2bcb2aea3f9e6c78a2d6a083cf040dd6f" as `0x${string}`;
const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948" as `0x${string}`;

// Capability-0 executors (confirmed active)
const EXECUTOR = "0x833c7a5c0628b3d47d12c3556ac1b02b2723f390" as `0x${string}`;

const RITUAL_WALLET_ABI = [
  {
    name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: process.env.DEPLOYER_PRIVATE_KEY, type: "address" }], outputs: [{ type: "uint256" }]
  },
  {
    name: "depositFor", type: "function", stateMutability: "payable",
    inputs: [
      { name: "user", type: "address" },
      { name: "lockDuration", type: "uint256" }
    ], outputs: []
  },
] as const;

function buildLlmInput(executorAddress: `0x${string}`, messagesJson: string): `0x${string}` {
  const llmParams = parseAbiParameters(
    "address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)"
  );
  return encodeAbiParameters(llmParams, [
    executorAddress, [], 300n, [], "0x",
    messagesJson,
    "zai-org/GLM-4.7-FP8",
    0n, process.env.DEPLOYER_PRIVATE_KEY, false, 512n, process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY, 1n, false, 0n, process.env.DEPLOYER_PRIVATE_KEY, "0x",
    -1n, process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY, false, 100n, "0x", "0x", -1n, 1000n, process.env.DEPLOYER_PRIVATE_KEY, false,
    [process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY],
  ]);
}

function generateSalt(): `0x${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

function computeCommitment(answer: string, salt: `0x${string}`, sender: `0x${string}`, bountyId: bigint) {
  return keccak256(encodePacked(["string", "bytes32", "address", "uint256"], [answer, salt, sender, bountyId]));
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const key2 = process.env.SUBMITTER_PRIVATE_KEY;
  const ownerAccount = privateKeyToAccount(key1);
  const submitterAccount = privateKeyToAccount(key2);

  const ownerWallet = await viem.getWalletClient(ownerAccount.address);
  const submitterWallet = await viem.getWalletClient(submitterAccount.address);

  const aiJudge = await viem.getContractAt("AIJudge", CONTRACT_ADDRESS);

  console.log("═".repeat(64));
  console.log("  RITUAL AI BOUNTY — REAL ON-CHAIN LLM JUDGE FLOW");
  console.log("═".repeat(64));
  console.log(`  Owner:     ${ownerAccount.address}`);
  console.log(`  Submitter: ${submitterAccount.address}`);
  console.log(`  Contract:  ${CONTRACT_ADDRESS}`);
  console.log(`  Executor:  ${EXECUTOR}`);

  // ── STEP 0: Fund contract's RitualWallet ────────────────────────────────────
  console.log("\n[STEP 0] Checking & funding contract's RitualWallet...");
  let contractRitualBal = await client.readContract({
    address: RITUAL_WALLET,
    abi: RITUAL_WALLET_ABI,
    functionName: "balanceOf",
    args: [CONTRACT_ADDRESS],
  }) as bigint;
  console.log(`  Current RitualWallet balance: ${formatEther(contractRitualBal)} RITUAL`);

  const MIN_BALANCE = parseEther("0.05");
  if (contractRitualBal < MIN_BALANCE) {
    console.log(`  Depositing 0.1 RITUAL into contract's RitualWallet...`);
    const depositTx = await ownerWallet.writeContract({
      address: RITUAL_WALLET,
      abi: RITUAL_WALLET_ABI,
      functionName: "depositFor",
      args: [CONTRACT_ADDRESS, 0n],
      value: parseEther("0.1"),
      account: ownerAccount,
      gas: 200_000n,
    });
    console.log(`  Deposit tx: ${depositTx}`);
    const receipt = await client.waitForTransactionReceipt({ hash: depositTx });
    if (receipt.status === "reverted") throw new Error("depositFor reverted!");

    contractRitualBal = await client.readContract({
      address: RITUAL_WALLET,
      abi: RITUAL_WALLET_ABI,
      functionName: "balanceOf",
      args: [CONTRACT_ADDRESS],
    }) as bigint;
    console.log(`  ✅ New RitualWallet balance: ${formatEther(contractRitualBal)} RITUAL`);
  } else {
    console.log(`  ✅ Already funded: ${formatEther(contractRitualBal)} RITUAL`);
  }

  // ── STEP 1: Create bounty ────────────────────────────────────────────────────
  const nextBountyId = await aiJudge.read.nextBountyId() as bigint;
  console.log(`\n[STEP 1] Creating bounty #${nextBountyId}...`);
  const block = await client.getBlock();
  const nowTs = block.timestamp;
  const isMs = nowTs > 50_000_000_000n;
  const subOff = isMs ? 20_000n : 20n;
  const revOff = isMs ? 40_000n : 40n;
  const subDeadline = nowTs + subOff;
  const revDeadline = nowTs + revOff;

  const createTx = await ownerWallet.writeContract({
    address: CONTRACT_ADDRESS, abi: aiJudge.abi, functionName: "createBounty",
    args: [
      "Can AI judge on Ritual Chain?",
      "RUBRIC: The answer must correctly describe how Ritual Chain enables on-chain LLM inference via TEE executors.",
      subDeadline, revDeadline
    ],
    value: parseEther("0.001"),
    account: ownerAccount, gas: 1_000_000n,
  });
  await client.waitForTransactionReceipt({ hash: createTx });
  console.log(`  ✅ Bounty #${nextBountyId} created! tx: ${createTx}`);

  // ── STEP 2: Submit commitment ────────────────────────────────────────────────
  const answer = "Ritual Chain enables on-chain LLM inference by routing smart contract calls through TEE executors registered in the TEEServiceRegistry. Each executor runs a model in a trusted execution environment and signs the result, which is delivered back to the contract asynchronously.";
  const salt = generateSalt();
  const commitment = computeCommitment(answer, salt, submitterAccount.address, nextBountyId);

  console.log(`\n[STEP 2] Submitting commitment...`);
  const commitTx = await submitterWallet.writeContract({
    address: CONTRACT_ADDRESS, abi: aiJudge.abi, functionName: "submitCommitment",
    args: [nextBountyId, commitment],
    account: submitterAccount, gas: 500_000n,
  });
  await client.waitForTransactionReceipt({ hash: commitTx });
  console.log(`  ✅ Commitment submitted! tx: ${commitTx}`);

  // ── STEP 3: Wait for submission deadline ────────────────────────────────────
  console.log(`\n[STEP 3] Waiting for submission phase to end...`);
  while (true) {
    const b = await client.getBlock();
    if (b.timestamp >= subDeadline) { console.log("  ✅ Submission deadline passed!"); break; }
    const rem = isMs ? Number(subDeadline - b.timestamp) / 1000 : Number(subDeadline - b.timestamp);
    console.log(`  Waiting... ${rem.toFixed(1)}s remaining`);
    await sleep(4000);
  }

  // ── STEP 4: Reveal answer ────────────────────────────────────────────────────
  console.log(`\n[STEP 4] Revealing answer...`);
  const revealTx = await submitterWallet.writeContract({
    address: CONTRACT_ADDRESS, abi: aiJudge.abi, functionName: "revealAnswer",
    args: [nextBountyId, answer, salt],
    account: submitterAccount, gas: 500_000n,
  });
  await client.waitForTransactionReceipt({ hash: revealTx });
  console.log(`  ✅ Answer revealed! tx: ${revealTx}`);

  // ── STEP 5: Wait for reveal deadline ────────────────────────────────────────
  console.log(`\n[STEP 5] Waiting for reveal phase to end...`);
  while (true) {
    const b = await client.getBlock();
    if (b.timestamp >= revDeadline) { console.log("  ✅ Reveal deadline passed!"); break; }
    const rem = isMs ? Number(revDeadline - b.timestamp) / 1000 : Number(revDeadline - b.timestamp);
    console.log(`  Waiting... ${rem.toFixed(1)}s remaining`);
    await sleep(4000);
  }

  // ── STEP 6: judgeAll with real LLM ──────────────────────────────────────────
  console.log(`\n[STEP 6] Calling judgeAll with REAL LLM precompile...`);
  const bountyData = await aiJudge.read.getBounty([nextBountyId]) as readonly any[];
  const submissionsCount = Number(bountyData[8]);
  console.log(`  Submissions to judge: ${submissionsCount}`);

  const submissions = [];
  for (let i = 0; i < submissionsCount; i++) {
    const sub = await aiJudge.read.getSubmission([nextBountyId, BigInt(i)]) as readonly any[];
    submissions.push({ index: i, submitter: sub[0], answer: sub[1] });
  }

  const prompt = [
    `You are an impartial bounty judge. Evaluate these submissions against the rubric.`,
    `Rubric: ${bountyData[2]}`,
    `Submissions: ${JSON.stringify(submissions.map(s => ({ index: s.index, answer: s.answer })))}`,
    `Return only valid JSON: {"winnerIndex":0,"summary":"reason"}`,
  ].join("\n");

  const messagesJson = JSON.stringify([
    { role: "system", content: "You are an impartial technical bounty judge. Return only valid JSON with winnerIndex and summary fields. No markdown." },
    { role: "user", content: prompt },
  ]);

  const llmInput = buildLlmInput(EXECUTOR, messagesJson);
  console.log(`  Calling judgeAll (executor: ${EXECUTOR})...`);

  const nonce = await client.getTransactionCount({ address: ownerAccount.address });
  const judgeTx = await ownerWallet.writeContract({
    address: CONTRACT_ADDRESS, abi: aiJudge.abi, functionName: "judgeAll",
    args: [nextBountyId, llmInput],
    account: ownerAccount, gas: 5_000_000n, nonce,
  });
  console.log(`  judgeAll tx: ${judgeTx}`);
  const judgeReceipt = await client.waitForTransactionReceipt({ hash: judgeTx });
  if (judgeReceipt.status === "reverted") {
    throw new Error("judgeAll transaction reverted!");
  }
  console.log(`  ✅ judgeAll completed successfully!`);

  // Read AI review
  const bountyAfter = await aiJudge.read.getBounty([nextBountyId]) as readonly any[];
  const aiReviewBytes = bountyAfter[10] as `0x${string}`;
  console.log(`  AI Review: ${aiReviewBytes !== "0x" ? hexToString(aiReviewBytes) : "(empty)"}`);

  // ── STEP 7: Finalize winner ──────────────────────────────────────────────────
  console.log(`\n[STEP 7] Finalizing winner...`);
  let winnerIndex = 0n;
  try {
    if (aiReviewBytes !== "0x") {
      const reviewText = hexToString(aiReviewBytes);
      const parsed = JSON.parse(reviewText);
      if (typeof parsed.winnerIndex === "number") winnerIndex = BigInt(parsed.winnerIndex);
    }
  } catch {}

  const finalizeTx = await ownerWallet.writeContract({
    address: CONTRACT_ADDRESS, abi: aiJudge.abi, functionName: "finalizeWinner",
    args: [nextBountyId, winnerIndex],
    account: ownerAccount, gas: 500_000n,
  });
  await client.waitForTransactionReceipt({ hash: finalizeTx });
  console.log(`  ✅ Winner finalized! tx: ${finalizeTx}`);

  console.log("\n" + "═".repeat(64));
  console.log("🎉 REAL ON-CHAIN LLM JUDGING COMPLETE!");
  console.log("═".repeat(64));
}

main().catch(e => {
  console.error("\n❌ ERROR:", e.shortMessage || e.message || e);
  process.exit(1);
});
