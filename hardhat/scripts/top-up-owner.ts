/**
 * Transfers RITUAL from the submitter (has 0.23 RITUAL) back to the owner
 * so the owner can create bounties with enough balance.
 */
import hre from "hardhat";
import { parseEther, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY; // Owner
  const key2 = process.env.SUBMITTER_PRIVATE_KEY; // Submitter

  const owner = privateKeyToAccount(key1);
  const submitter = privateKeyToAccount(key2);

  const ownerBal = await client.getBalance({ address: owner.address });
  const submitterBal = await client.getBalance({ address: submitter.address });

  console.log(`Owner     (${owner.address}): ${formatEther(ownerBal)} RITUAL`);
  console.log(`Submitter (${submitter.address}): ${formatEther(submitterBal)} RITUAL`);

  // Transfer 0.1 RITUAL from submitter to owner
  const amount = parseEther("0.1");
  if (submitterBal < amount + parseEther("0.005")) {
    console.log("Submitter does not have enough balance to transfer 0.1 RITUAL. Skipping.");
    return;
  }

  console.log(`\nTransferring 0.1 RITUAL from submitter to owner...`);
  const submitterWallet = await viem.getWalletClient(submitter.address);
  const hash = await submitterWallet.sendTransaction({
    to: owner.address,
    value: amount,
    account: submitter,
  });
  console.log(`Transfer tx: ${hash}`);
  await client.waitForTransactionReceipt({ hash });

  const ownerBalAfter = await client.getBalance({ address: owner.address });
  const submitterBalAfter = await client.getBalance({ address: submitter.address });
  console.log(`\nAfter transfer:`);
  console.log(`Owner     (${owner.address}): ${formatEther(ownerBalAfter)} RITUAL`);
  console.log(`Submitter (${submitter.address}): ${formatEther(submitterBalAfter)} RITUAL`);
  console.log(`\n✅ Owner is now funded for creating bounties!`);
}

main().catch((err) => {
  console.error("❌ Transfer failed:", err.message || err);
  process.exit(1);
});
