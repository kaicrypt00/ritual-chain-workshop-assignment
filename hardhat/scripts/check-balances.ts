import hre from "hardhat";
import { privateKeyToAccount } from "viem/accounts";
import { formatEther } from "viem";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const key2 = process.env.SUBMITTER_PRIVATE_KEY;

  const acc1 = privateKeyToAccount(key1);
  const acc2 = privateKeyToAccount(key2);

  const bal1 = await client.getBalance({ address: acc1.address });
  const bal2 = await client.getBalance({ address: acc2.address });

  console.log("Wallet 1 (Main/Owner):", acc1.address, "Balance:", formatEther(bal1), "RITUAL");
  console.log("Wallet 2 (Submitter):", acc2.address, "Balance:", formatEther(bal2), "RITUAL");
}

main().catch(console.error);
