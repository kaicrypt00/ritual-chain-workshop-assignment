import hre from "hardhat";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const hash = "0x06b7d65463c2fcee47628b6f30543105bc5de9ddb5dabee2f58565a862978a55";
  const receipt = await client.getTransactionReceipt({ hash });
  console.log("Transaction status:", receipt.status);
  console.log("To address:", receipt.to);
  console.log("Logs count:", receipt.logs.length);
  for (let i = 0; i < receipt.logs.length; i++) {
    console.log(`Log ${i}:`, receipt.logs[i]);
  }
}

main().catch(console.error);
