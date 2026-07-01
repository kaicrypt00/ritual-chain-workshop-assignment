import hre from "hardhat";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  
  const [walletClient] = await viem.getWalletClients();
  const publicClient = await viem.getPublicClient();
  
  console.log("Deploying AIJudge from:", walletClient.account.address);
  
  const balance = await publicClient.getBalance({ address: walletClient.account.address });
  console.log("Balance:", (Number(balance) / 1e18).toFixed(6), "ETH");

  const artifact = await hre.artifacts.readArtifact("AIJudge");

  const nextNonce = await publicClient.getTransactionCount({
    address: walletClient.account.address,
    blockTag: "pending"
  });
  console.log("Deploying with nonce:", nextNonce);

  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [],
    nonce: nextNonce,
  });

  console.log("Deploy tx hash:", hash);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress!;

  console.log("\n✅ AIJudge deployed at:", contractAddress);
  console.log("\nUpdate your .env.local:");
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${contractAddress}`);
  
  return contractAddress;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
