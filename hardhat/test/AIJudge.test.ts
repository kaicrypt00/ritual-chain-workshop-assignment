/**
 * AIJudge commit-reveal integration tests
 * Uses Hardhat 3's native node:test runner + viem helpers.
 *
 * Run with:
 *   npx hardhat test test/AIJudge.test.ts --network hardhatMainnet
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";
import { keccak256, encodePacked, toHex, parseEther } from "viem";

// ── helpers ───────────────────────────────────────────────────────────────────

let cachedConnection: any;
async function getConnection() {
  if (!cachedConnection) {
    cachedConnection = await (hre.network as any).getOrCreate();
  }
  return cachedConnection;
}

async function getViem() {
  const conn = await getConnection();
  return conn.viem;
}

async function blockTs(): Promise<bigint> {
  const viem = await getViem();
  const client = await viem.getPublicClient();
  const block = await client.getBlock();
  return block.timestamp;
}

async function advanceTime(seconds: bigint) {
  const conn = await getConnection();
  await conn.provider.send("evm_increaseTime", [Number(seconds)]);
  await conn.provider.send("evm_mine");
}

function makeCommitment(
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

function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = Math.floor(Math.random() * 256);
  return toHex(bytes);
}

/** Deploy contract + create one bounty, return useful handles. */
async function setup(subOffset = 30n, revOffset = 90n) {
  const viem = await getViem();
  const contract = await viem.deployContract("AIJudge");
  const wallets = await viem.getWalletClients();
  const owner = wallets[0].account.address as `0x${string}`;
  const alice = wallets[1].account.address as `0x${string}`;
  const bob   = wallets[2].account.address as `0x${string}`;

  const now = await blockTs();
  const subDeadline = now + subOffset;
  const revDeadline = now + revOffset;

  const publicClient = await viem.getPublicClient();

  const txHash = await contract.write.createBounty(
    ["Test Bounty", "Correctness 100%", subDeadline, revDeadline],
    { value: parseEther("1"), account: owner },
  );
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  // First indexed topic in BountyCreated is bountyId
  const bountyId = BigInt(receipt.logs[0]?.topics?.[1] ?? "0x1");

  return { contract, publicClient, owner, alice, bob, bountyId, subDeadline, revDeadline };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("AIJudge – commit-reveal", { timeout: 120_000 }, () => {

  it("1. valid commit then reveal succeeds", async () => {
    const { contract, publicClient, alice, bountyId, subDeadline } = await setup();

    const answer = "The answer is 42";
    const salt   = randomSalt();
    const commitment = makeCommitment(answer, salt, alice, bountyId);

    // Phase 1: commit
    const h1 = await contract.write.submitCommitment([bountyId, commitment], { account: alice });
    await publicClient.waitForTransactionReceipt({ hash: h1 });

    // Advance into reveal phase
    const now = await blockTs();
    await advanceTime(subDeadline - now + 1n);

    // Phase 2: reveal
    const h2 = await contract.write.revealAnswer([bountyId, answer, salt], { account: alice });
    await publicClient.waitForTransactionReceipt({ hash: h2 });

    const [submitter, revealedAnswer] = await contract.read.getSubmission([bountyId, 0n]);
    assert.equal(submitter.toLowerCase(), alice.toLowerCase(), "wrong submitter");
    assert.equal(revealedAnswer, answer, "wrong answer stored");
  });

  it("2. reveal with wrong answer fails", async () => {
    const { contract, publicClient, alice, bountyId, subDeadline } = await setup();

    const salt       = randomSalt();
    const answer     = "correct answer";
    const commitment = makeCommitment(answer, salt, alice, bountyId);

    const h1 = await contract.write.submitCommitment([bountyId, commitment], { account: alice });
    await publicClient.waitForTransactionReceipt({ hash: h1 });

    await advanceTime(subDeadline - (await blockTs()) + 1n);

    await assert.rejects(
      () => contract.write.revealAnswer([bountyId, "WRONG answer", salt], { account: alice }),
      "Expected revert for wrong answer",
    );
  });

  it("3. reveal with wrong salt fails", async () => {
    const { contract, publicClient, alice, bountyId, subDeadline } = await setup();

    const salt      = randomSalt();
    const wrongSalt = randomSalt();
    const answer    = "my answer";
    const commitment = makeCommitment(answer, salt, alice, bountyId);

    const h1 = await contract.write.submitCommitment([bountyId, commitment], { account: alice });
    await publicClient.waitForTransactionReceipt({ hash: h1 });

    await advanceTime(subDeadline - (await blockTs()) + 1n);

    await assert.rejects(
      () => contract.write.revealAnswer([bountyId, answer, wrongSalt], { account: alice }),
      "Expected revert for wrong salt",
    );
  });

  it("4. reveal before submission deadline fails", async () => {
    const { contract, alice, bountyId } = await setup();

    const salt       = randomSalt();
    const answer     = "early reveal attempt";
    const commitment = makeCommitment(answer, salt, alice, bountyId);

    // Commit — still in Phase 1
    await contract.write.submitCommitment([bountyId, commitment], { account: alice });

    // Don't advance time — try to reveal immediately (Phase 1 still active)
    await assert.rejects(
      () => contract.write.revealAnswer([bountyId, answer, salt], { account: alice }),
      "Expected revert: reveal before submission deadline",
    );
  });

  it("5. reveal after reveal deadline fails", async () => {
    const { contract, alice, bountyId, revDeadline } = await setup();

    const salt       = randomSalt();
    const answer     = "late reveal attempt";
    const commitment = makeCommitment(answer, salt, alice, bountyId);

    await contract.write.submitCommitment([bountyId, commitment], { account: alice });

    // Jump PAST the reveal deadline
    await advanceTime(revDeadline - (await blockTs()) + 1n);

    await assert.rejects(
      () => contract.write.revealAnswer([bountyId, answer, salt], { account: alice }),
      "Expected revert: reveal after reveal deadline",
    );
  });

  it("6. double commit from same address fails", async () => {
    const { contract, alice, bountyId } = await setup();

    const salt1 = randomSalt();
    const salt2 = randomSalt();
    const c1 = makeCommitment("answer one", salt1, alice, bountyId);
    const c2 = makeCommitment("answer two", salt2, alice, bountyId);

    await contract.write.submitCommitment([bountyId, c1], { account: alice });

    await assert.rejects(
      () => contract.write.submitCommitment([bountyId, c2], { account: alice }),
      "Expected revert: double commit from same address",
    );
  });

  it("7. commit after submission deadline fails", async () => {
    const { contract, alice, bountyId, subDeadline } = await setup();

    await advanceTime(subDeadline - (await blockTs()) + 1n);

    const salt       = randomSalt();
    const commitment = makeCommitment("late commit", salt, alice, bountyId);

    await assert.rejects(
      () => contract.write.submitCommitment([bountyId, commitment], { account: alice }),
      "Expected revert: commit after submission deadline",
    );
  });

  it("8. judgeAll before reveal deadline fails", async () => {
    const { contract, publicClient, owner, alice, bountyId, subDeadline } = await setup();

    const salt       = randomSalt();
    const answer     = "some answer";
    const commitment = makeCommitment(answer, salt, alice, bountyId);

    const h1 = await contract.write.submitCommitment([bountyId, commitment], { account: alice });
    await publicClient.waitForTransactionReceipt({ hash: h1 });

    await advanceTime(subDeadline - (await blockTs()) + 1n);

    const h2 = await contract.write.revealAnswer([bountyId, answer, salt], { account: alice });
    await publicClient.waitForTransactionReceipt({ hash: h2 });

    // Reveal deadline NOT yet passed — judgeAll must revert
    await assert.rejects(
      () => contract.write.judgeAll([bountyId, "0x"], { account: owner }),
      "Expected revert: judgeAll before reveal deadline",
    );
  });

  it("9. finalizeWinner with out-of-range index fails", async () => {
    const { contract, publicClient, owner, alice, bob, bountyId, subDeadline, revDeadline } =
      await setup();

    // Alice commits but does NOT reveal (so she doesn't appear in submissions[])
    const saltA       = randomSalt();
    const commitmentA = makeCommitment("hidden", saltA, alice, bountyId);
    const h1 = await contract.write.submitCommitment([bountyId, commitmentA], { account: alice });
    await publicClient.waitForTransactionReceipt({ hash: h1 });

    // Bob commits AND reveals (submissions[0] = Bob)
    const saltB       = randomSalt();
    const answerB     = "bob answer";
    const commitmentB = makeCommitment(answerB, saltB, bob, bountyId);
    const h2 = await contract.write.submitCommitment([bountyId, commitmentB], { account: bob });
    await publicClient.waitForTransactionReceipt({ hash: h2 });

    await advanceTime(subDeadline - (await blockTs()) + 1n);

    const h3 = await contract.write.revealAnswer([bountyId, answerB, saltB], { account: bob });
    await publicClient.waitForTransactionReceipt({ hash: h3 });

    await advanceTime(revDeadline - (await blockTs()) + 1n);

    // Only 1 submission was revealed (index 0 = Bob).
    // Alice never revealed so submissions.length == 1.
    // Call judgeAllMock first so that the bounty state is 'judged'
    const h4 = await contract.write.judgeAllMock([bountyId, "0x"], { account: owner });
    await publicClient.waitForTransactionReceipt({ hash: h4 });

    // Index 1 is out of range (unrevealed participant) -> contract must revert.
    await assert.rejects(
      () => contract.write.finalizeWinner([bountyId, 1n], { account: owner }),
      "Expected revert: index out of range (unrevealed winner)",
    );
  });

  it("10. finalizeWinner without judgeAll fails (judged gate enforced)", async () => {
    const { contract, publicClient, owner, alice, bountyId, subDeadline, revDeadline } =
      await setup();

    const salt       = randomSalt();
    const answer     = "winning answer";
    const commitment = makeCommitment(answer, salt, alice, bountyId);

    const h1 = await contract.write.submitCommitment([bountyId, commitment], { account: alice });
    await publicClient.waitForTransactionReceipt({ hash: h1 });

    await advanceTime(subDeadline - (await blockTs()) + 1n);

    const h2 = await contract.write.revealAnswer([bountyId, answer, salt], { account: alice });
    await publicClient.waitForTransactionReceipt({ hash: h2 });

    await advanceTime(revDeadline - (await blockTs()) + 1n);

    // bounty.judged == false → must revert
    await assert.rejects(
      () => contract.write.finalizeWinner([bountyId, 0n], { account: owner }),
      "Expected revert: finalize without judgeAll",
    );
  });
});
