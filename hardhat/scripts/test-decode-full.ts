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
  messagesJson: string
): `0x${string}` {
  const llmParams = parseAbiParameters(
    "address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)"
  );

  return encodeAbiParameters(llmParams, [
    executorAddress,
    [],
    300n,
    [],
    "0x",
    messagesJson,
    "zai-org/GLM-4.7-FP8",
    0n,
    process.env.DEPLOYER_PRIVATE_KEY,
    false,
    512n,
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
    100n,
    "0x",
    "0x",
    -1n,
    1000n,
    process.env.DEPLOYER_PRIVATE_KEY,
    false,
    [process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY],
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
    { role: "system", content: "You are a brief AI assistant." },
    { role: "user", content: "In one sentence, what is Ritual Chain?" },
  ]);

  const input = buildLlmInput(executorAddress, messages);

  console.log("Calling LLM precompile...");
  try {
    const res = await client.call({
      account: ownerAccount.address,
      to: "0x0000000000000000000000000000000000000802",
      data: input,
      gas: 5_000_000n
    });

    if (res.data) {
      console.log("Response data hex length:", res.data.length);
      console.log("Raw response (first 256 chars):", res.data.slice(0, 258));

      // Try decode (bytes, bytes)
      try {
        const [simmedInput, actualOutput] = decodeAbiParameters(
          parseAbiParameters("bytes, bytes"),
          res.data
        );
        console.log("Decoded into (bytes, bytes) successfully.");
        console.log("actualOutput hex length:", actualOutput.length);
        console.log("actualOutput raw:", actualOutput);

        // Let's decode actualOutput as different variations:
        // Variation 1: (bool, bytes, bytes, string, (string,string,string))
        try {
          const [hasError, completionData, modelMetadata, errorMessage, convoHistory] = decodeAbiParameters(
            parseAbiParameters("bool, bytes, bytes, string, (string,string,string)"),
            actualOutput
          );
          console.log("\nDecoded Variation 1 successfully:");
          console.log("  hasError:    ", hasError);
          console.log("  errorMessage:", errorMessage);
          console.log("  convoHistory:", convoHistory);
          console.log("  completion:  ", hexToString(completionData));
        } catch (e: any) {
          console.log("\nVariation 1 failed to decode:", e.message);
        }

        // Variation 2: (bool, bytes, bytes, string)
        try {
          const [hasError, completionData, modelMetadata, errorMessage] = decodeAbiParameters(
            parseAbiParameters("bool, bytes, bytes, string"),
            actualOutput
          );
          console.log("\nDecoded Variation 2 successfully:");
          console.log("  hasError:    ", hasError);
          console.log("  errorMessage:", errorMessage);
          console.log("  completion:  ", hexToString(completionData));
        } catch (e: any) {
          console.log("\nVariation 2 failed to decode:", e.message);
        }

        // Variation 3: string (what if it just returns string?)
        try {
          const [text] = decodeAbiParameters(
            parseAbiParameters("string"),
            actualOutput
          );
          console.log("\nDecoded Variation 3 successfully (string):");
          console.log("  text:", text);
        } catch (e: any) {
          console.log("\nVariation 3 failed to decode:", e.message);
        }

      } catch (e: any) {
        console.log("Failed to decode outer (bytes, bytes):", e.message);
      }
    } else {
      console.log("No data returned.");
    }
  } catch (e: any) {
    console.log("Call reverted:", e.shortMessage || e.message);
  }
}

main().catch(console.error);
