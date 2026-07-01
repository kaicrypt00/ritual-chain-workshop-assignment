import hre from "hardhat";
import { parseEther, formatEther } from "viem";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const wallets = await viem.getWalletClients();
  const wallet = wallets[0];
  console.log("Wallet Address:", wallet.account.address);
  console.log("Hardhat Network Name:", hre.network.name);

  const balance = await client.getBalance({ address: wallet.account.address });
  console.log("Wallet Balance:", formatEther(balance), "RITUAL");

  const contractAddress = "0x02a8583e951cf109D5cF09E1DEb7F1839d98E035";

  // Check if contract code exists
  const code = await client.getBytecode({ address: contractAddress });
  if (!code || code === "0x") {
    throw new Error(`No contract found at address ${contractAddress}`);
  }
  console.log("Contract verified at:", contractAddress);

  const block = await client.getBlock();
  const nowTs = block.timestamp; // block timestamp on Ritual (in milliseconds or seconds)
  console.log("Current block timestamp:", nowTs.toString());

  // Detect if block timestamp is in milliseconds (greater than 50 billion)
  const isMillisecondTimestamp = nowTs > 50000000000n;
  console.log("Is Millisecond Timestamp:", isMillisecondTimestamp);

  // 15 minutes and 35 minutes offsets
  const subOffset = isMillisecondTimestamp ? 900_000n : 900n;
  const revOffset = isMillisecondTimestamp ? 2100_000n : 2100n;

  const subDeadline = nowTs + subOffset;
  const revDeadline = nowTs + revOffset;

  console.log("Creating bounty with:");
  console.log("  Submission Deadline:", subDeadline.toString());
  console.log("  Reveal Deadline:", revDeadline.toString());

  const contract = await viem.getContractAt("AIJudge", contractAddress);

  const hash = await contract.write.createBounty(
    [
      "What Ritual's Mission?",
      "Ritual Mission is to bring AI onchain and bring power back to people. No oracle and no keepers true Intelligence onchain.",
      subDeadline,
      revDeadline
    ],
    {
      value: parseEther("0.2"),
      gas: 500_000n
    }
  );

  console.log("Transaction Hash:", hash);
  console.log("Waiting for confirmation...");
  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log("Transaction Receipt Status:", receipt.status);
  if (receipt.status === "reverted") {
    console.error("Transaction reverted!");
  } else {
    console.log("Transaction succeeded! Block Number:", receipt.blockNumber.toString());
  }
}

main().catch(console.error);
