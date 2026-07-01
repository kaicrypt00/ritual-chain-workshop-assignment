import hre from "hardhat";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const contractAddress = "0x02a8583e951cf109D5cF09E1DEb7F1839d98E035";
  const contract = await viem.getContractAt("AIJudge", contractAddress);

  // Get the latest bounty ID
  const nextId = await contract.read.nextBountyId();
  const latestId = nextId - 1n;
  console.log("Latest Bounty ID:", latestId.toString());

  if (latestId > 0n) {
    const bounty = await contract.read.getBounty([latestId]);
    console.log("Bounty Details:");
    console.log("  Owner:", bounty[0]);
    console.log("  Title:", bounty[1]);
    console.log("  Rubric:", bounty[2]);
    console.log("  Reward:", hre.ethers ? hre.ethers.formatEther(bounty[3]) : bounty[3].toString());
    console.log("  Submission Deadline:", bounty[4].toString());
    console.log("  Reveal Deadline:", bounty[5].toString());
    console.log("  Judged:", bounty[6]);
    console.log("  Finalized:", bounty[7]);
    console.log("  Submission Count:", bounty[8].toString());
  }
}

main().catch(console.error);
