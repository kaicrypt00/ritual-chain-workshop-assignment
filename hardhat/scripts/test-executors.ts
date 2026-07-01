/**
 * Test different discovered executors with 0x0802 precompile to see which one is valid.
 */

import hre from "hardhat";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const key1 = process.env.DEPLOYER_PRIVATE_KEY;
const ownerAccount = privateKeyToAccount(key1);

function buildLlmInput(
  executorAddress: `0x${string}`,
  messagesJson: string,
): `0x${string}` {
  const llmParams = parseAbiParameters(
    "address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)",
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
    8192n,
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
    ["gcs", "convos/session.jsonl", "GCS_CREDS"],
  ]);
}

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const client = await connection.viem.getPublicClient();

  const executors = [
    { name: "Cap 1 Active (0xec6a...)", address: "0xec6a6c7ebd08616c805e18cdea6bf9c54950c77d" },
    { name: "Cap 3 Active (0xb7b5...)", address: "0xb7b5b31def82e3364ba2483eb3ca8d4f283819ce" },
    { name: "Cap 0 Active [0] (0x833c...)", address: "0x833c7a5c0628b3d47d12c3556ac1b02b2723f390" },
  ];

  const messagesJson = JSON.stringify([
    { role: "user", content: "hello" }
  ]);

  for (const exec of executors) {
    console.log(`\nTesting executor: ${exec.name} (${exec.address})`);
    const input = buildLlmInput(exec.address as `0x${string}`, messagesJson);

    try {
      // Simulate calling a dummy method or precompile call directly
      // Since client.call performs node EVM simulation, if the executor is invalid,
      // it will throw the exact registry registration error!
      const res = await client.call({
        account: ownerAccount.address,
        to: "0x0000000000000000000000000000000000000802",
        data: input,
        gas: 5_000_000n
      });
      console.log("👉 Success (or returned data)!");
    } catch (e: any) {
      console.log(`❌ Failed:`, e.details || e.shortMessage || e.message);
    }
  }
}

main().catch(console.error);
