import hre from "hardhat";
import { keccak256, encodePacked } from "viem";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const contractAddress = "0xa7b186888d6cecdd91049549e62817d68269308d";
  const submitterAddress = "0x7741545560fa5029C5Ab1e7c49728D2e421dE2EA";
  const bountyId = 4n;

  const aiJudgeAbi = [
    {
      name: "getBounty",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "bountyId", type: "uint256" }],
      outputs: [
        { name: "owner", type: "address" },
        { name: "title", type: "string" },
        { name: "rubric", type: "string" },
        { name: "reward", type: "uint256" },
        { name: "submissionDeadline", type: "uint256" },
        { name: "revealDeadline", type: "uint256" },
        { name: "judged", type: "bool" },
        { name: "finalized", type: "bool" },
        { name: "submissionCount", type: "uint256" },
        { name: "winnerIndex", type: "uint256" },
        { name: "aiReview", type: "bytes" },
      ],
    },
    {
      name: "hasCommitted",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "bountyId", type: "uint256" }, { name: "user", type: "address" }],
      outputs: [{ name: process.env.DEPLOYER_PRIVATE_KEY, type: "bool" }],
    },
    {
      name: "getCommitment",
      type: "function",
      stateMutability: "view",
      inputs: [{ name: "bountyId", type: "uint256" }, { name: "user", type: "address" }],
      outputs: [
        { name: "hash", type: "bytes32" },
        { name: "revealed", type: "bool" },
        { name: "answer", type: "string" }
      ]
    }
  ] as const;

  console.log("Checking Bounty #4 state...");
  const bounty = await client.readContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "getBounty",
    args: [bountyId],
  });

  const [owner, title, rubric, reward, subDeadline, revDeadline, judged, finalized, count, winnerIndex] = bounty;
  console.log({
    owner,
    title,
    reward: reward.toString(),
    subDeadline: subDeadline.toString(),
    revDeadline: revDeadline.toString(),
    judged,
    finalized,
    count: count.toString(),
    winnerIndex: winnerIndex.toString(),
  });

  const committed = await client.readContract({
    address: contractAddress,
    abi: aiJudgeAbi,
    functionName: "hasCommitted",
    args: [bountyId, submitterAddress],
  });
  console.log(`Has committed: ${committed}`);

  if (committed) {
    const commitmentObj = await client.readContract({
      address: contractAddress,
      abi: aiJudgeAbi,
      functionName: "getCommitment",
      args: [bountyId, submitterAddress],
    });
    const [hash, revealed, answerStr] = commitmentObj;
    console.log({
      onChainCommitmentHash: hash,
      revealed,
      answerStr,
    });

    const expectedHash = keccak256(
      encodePacked(
        ["string", "bytes32", "address", "uint256"],
        ["yes", "0xeb71e0e4e69db6090c3143b7772e29d51ad936bf07bba1fdcae8c230798827b8", submitterAddress, bountyId]
      )
    );
    console.log(`Computed expected hash for 'yes': ${expectedHash}`);
    console.log(`Does it match? ${expectedHash === hash ? "YES" : "NO"}`);
  }
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
