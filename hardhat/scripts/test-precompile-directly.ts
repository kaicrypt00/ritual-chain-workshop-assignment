import hre from "hardhat";
import {
  encodeAbiParameters,
  parseAbiParameters,
  decodeAbiParameters,
  hexToString,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

function buildLlmInput(
  executorAddress: `0x${string}`,
  messagesJson: string,
  maxCompletionTokens: bigint,
  temperature: bigint,
  convoHistory: [string, string, string]
): `0x${string}` {
  const llmParams = parseAbiParameters(
    "address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)",
  );

  return encodeAbiParameters(llmParams, [
    executorAddress,
    [],
    30n,
    [],
    "0x",
    messagesJson,
    "zai-org/GLM-4.7-FP8",
    0n,
    process.env.DEPLOYER_PRIVATE_KEY,
    false,
    maxCompletionTokens,
    process.env.DEPLOYER_PRIVATE_KEY,
    process.env.DEPLOYER_PRIVATE_KEY,
    1n,
    false,
    0n,
    process.env.DEPLOYER_PRIVATE_KEY,
    "0x",
    -1n,
    process.env.DEPLOYER_PRIVATE_KEY,
    process.env.DEPLOYER_PRIVATE_KEY,
    false,
    temperature,
    "0x",
    "0x",
    -1n,
    1000n,
    process.env.DEPLOYER_PRIVATE_KEY,
    false,
    convoHistory,
  ]);
}

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const ownerAccount = privateKeyToAccount(key1);
  const executorAddress = "0x833c7a5c0628b3d47d12c3556ac1b02b2723f390" as `0x${string}`;

  const messages = JSON.stringify([
    { role: "user", content: "hello" }
  ]);

  const configs = [
    {
      name: "Doc Example (maxTokens=-1, temp=700, standard convoHistory)",
      maxTokens: 512n,
      temp: 700n,
      convo: [process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY] as [string, string, string]
    }
  ];

  for (const config of configs) {
    console.log(`\nTesting: ${config.name}`);
    const input = buildLlmInput(executorAddress, messages, config.maxTokens, config.temp, config.convo);

    try {
      const res = await client.call({
        account: ownerAccount.address,
        to: "0x0000000000000000000000000000000000000802",
        data: input,
        gas: 5_000_000n
      });

      if (res.data) {
        // Decode (bytes, bytes)
        const [simmedInput, actualOutput] = decodeAbiParameters(
          parseAbiParameters("bytes, bytes"),
          res.data
        );

        // Decode actualOutput: (bool, bytes, bytes, string, (string,string,string))
        const [hasError, completionData, modelMetadata, errorMessage, convoHistory] = decodeAbiParameters(
          parseAbiParameters("bool, bytes, bytes, string, (string,string,string)"),
          actualOutput
        );

        console.log("Success!");
        console.log("  hasError:    ", hasError);
        console.log("  errorMessage:", errorMessage);
        console.log("  convoHistory:", convoHistory);
        console.log("  completion:  ", hexToString(completionData));
      } else {
        console.log("Success, but no data returned.");
      }
    } catch (e: any) {
      console.log("Failed. Message:", e.shortMessage || e.message?.slice(0, 150));
    }
  }
}

main().catch(console.error);
