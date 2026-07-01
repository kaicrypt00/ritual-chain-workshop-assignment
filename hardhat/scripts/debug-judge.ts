import hre from "hardhat";
import { stringToHex, toHex, encodeFunctionData, decodeFunctionResult } from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const ownerAccount = privateKeyToAccount(key1);
  const contractAddress = "0xa7b186888d6cecdd91049549e62817d68269308d";

  const aiJudge = await viem.getContractAt("AIJudge", contractAddress);

  // Try bounty 11 which is ready
  const bountyId = 11n;

  const mockReviewJson = JSON.stringify({
    winnerIndex: 0,
    summary: "Submission correctly describes Ritual's mission of decentralized AI inference and decentralized oracles on-chain."
  });
  const mockReviewBytes = stringToHex(mockReviewJson) as `0x${string}`;

  console.log("Simulating judgeAllMock for bounty", bountyId.toString());
  console.log("mockReviewBytes:", mockReviewBytes);

  // Try simulate first
  try {
    const result = await client.simulateContract({
      address: contractAddress,
      abi: aiJudge.abi,
      functionName: "judgeAllMock",
      args: [bountyId, mockReviewBytes],
      account: ownerAccount,
    });
    console.log("Simulation SUCCESS:", result);
  } catch (e: any) {
    console.log("Simulation FAILED:", e.message);
    if (e.cause) console.log("Cause:", e.cause.message || e.cause);
    if (e.data) console.log("Revert data:", e.data);
  }

  // Also check the function selector in the ABI
  console.log("\nABI functions available:");
  for (const item of aiJudge.abi) {
    if ((item as any).type === "function") {
      console.log(" -", (item as any).name, "(", (item as any).inputs?.map((i: any) => i.type).join(", "), ")");
    }
  }

  // Check raw bytecode at contract address to see if judgeAllMock selector exists
  const bytecode = await client.getBytecode({ address: contractAddress });
  if (bytecode) {
    // judgeAllMock(uint256,bytes) selector = first 4 bytes of keccak256
    const { keccak256, toBytes } = await import("viem");
    const selector = keccak256(toBytes("judgeAllMock(uint256,bytes)")).slice(0, 10);
    console.log(`\njudgeAllMock selector: ${selector}`);
    console.log(`Selector in bytecode? ${bytecode.includes(selector.slice(2))}`);

    const finalizeSelector = keccak256(toBytes("finalizeWinner(uint256,uint256)")).slice(0, 10);
    console.log(`finalizeWinner selector: ${finalizeSelector}`);
    console.log(`Selector in bytecode? ${bytecode.includes(finalizeSelector.slice(2))}`);

    const judgeAllSelector = keccak256(toBytes("judgeAll(uint256,bytes)")).slice(0, 10);
    console.log(`judgeAll selector: ${judgeAllSelector}`);
    console.log(`Selector in bytecode? ${bytecode.includes(judgeAllSelector.slice(2))}`);
  }
}

main().catch(console.error);
