import hre from "hardhat";
import { parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const client = await connection.viem.getPublicClient();
  
  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const ownerAccount = privateKeyToAccount(key1);
  const ownerWallet = await connection.viem.getWalletClient(ownerAccount.address);
  
  const contractAddress = "0x4c8db273132a493e41143c962510ca4f48f2ca54" as `0x${string}`;
  const aiJudge = await connection.viem.getContractAt("AIJudge", contractAddress);

  // Set deadlines: 1 hour and 2 hours from now
  const now = Date.now();
  const subTs = BigInt(now + 1 * 60 * 60 * 1000) + 30_000n;
  const revTs = BigInt(now + 2 * 60 * 60 * 1000) + 30_000n;
  const value = parseEther("0.001");

  console.log("Submitting createBounty...");
  console.log("  subTs:", subTs.toString());
  console.log("  revTs:", revTs.toString());
  console.log("  value:", value.toString());

  try {
    const tx = await ownerWallet.writeContract({
      address: contractAddress,
      abi: aiJudge.abi,
      functionName: "createBounty",
      args: ["Frontend Test Title", "RUBRIC: Test Rubric", subTs, revTs],
      value,
      maxFeePerGas: 2_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      account: ownerAccount,
    });
    console.log("Tx Hash:", tx);
    
    console.log("Waiting for receipt...");
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    console.log("Receipt Status:", receipt.status);
    console.log("Block Number:", receipt.blockNumber.toString());
  } catch (e: any) {
    console.error("Error creating bounty:", e.message || e);
  }
}

main().catch(console.error);
