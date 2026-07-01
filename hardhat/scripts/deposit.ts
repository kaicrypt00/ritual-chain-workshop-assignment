import hre from "hardhat";
import { parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const ownerKey = process.env.DEPLOYER_PRIVATE_KEY;
  const ownerAccount = privateKeyToAccount(ownerKey);

  const ritualWalletAddress = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948";
  const ritualWalletAbi = [
    {
      name: "deposit",
      type: "function",
      stateMutability: "payable",
      inputs: [{ name: "lockDuration", type: "uint256" }],
      outputs: [],
    }
  ];

  console.log("Depositing 0.3 RITUAL into RitualWallet for owner...");

  const walletClient = await viem.getWalletClient(ownerAccount.address);

  const { request } = await client.simulateContract({
    address: ritualWalletAddress,
    abi: ritualWalletAbi,
    functionName: "deposit",
    args: [100000n],
    value: parseEther("0.3"),
    account: ownerAccount,
  });

  const hash = await walletClient.writeContract(request);
  console.log("Transaction Hash:", hash);
  console.log("Waiting for confirmation...");
  const receipt = await client.waitForTransactionReceipt({ hash });
  console.log("Deposit completed successfully! Status:", receipt.status);
}

main().catch(console.error);
