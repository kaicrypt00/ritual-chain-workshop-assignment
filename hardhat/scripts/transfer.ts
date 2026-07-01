import hre from "hardhat";
import { parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const submitterKey = process.env.DEPLOYER_PRIVATE_KEY;
  const submitterAccount = privateKeyToAccount(submitterKey);

  const ownerAddress = "0xc1227DeB6B95Af7600BEC83365909EC1A78c2944";

  console.log("Transferring 0.35 RITUAL from Submitter:", submitterAccount.address, "to Owner:", ownerAddress);

  const walletClient = await viem.getWalletClient(submitterAccount.address);

  const hash = await walletClient.sendTransaction({
    account: submitterAccount,
    to: ownerAddress,
    value: parseEther("0.35"),
  });

  console.log("Transaction Hash:", hash);
  console.log("Waiting for confirmation...");
  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log("Transfer completed successfully! Status:", receipt.status);
}

main().catch(console.error);
