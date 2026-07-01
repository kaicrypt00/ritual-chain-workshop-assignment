import hre from "hardhat";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const txHash = "0x5afa8ec7e3cc485dbf67a3dd87aac7d97670bd2b707765aa631a81c092675f54";
  try {
    const tx = await client.getTransaction({ hash: txHash as `0x${string}` });
    console.log("Transaction details:", {
      from: tx.from,
      to: tx.to,
      value: tx.value.toString(),
      blockNumber: tx.blockNumber?.toString(),
    });

    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    console.log("Receipt details:", {
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
    });

    // Try to simulate call to see the revert reason
    try {
      const code = await client.call({
        account: tx.from,
        to: tx.to ?? undefined,
        data: tx.input,
        value: tx.value,
        blockNumber: tx.blockNumber ? tx.blockNumber - 1n : undefined,
      });
      console.log("Simulated successfully? Result:", code);
    } catch (simError) {
      console.log("Simulation reverted with:", simError);
    }
  } catch (err) {
    console.error("Error retrieving tx details:", err);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
