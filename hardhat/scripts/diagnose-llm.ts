/**
 * Diagnose why judgeAll with real LLM executor fails:
 * 1. Check contract's RitualWallet balance
 * 2. Check contract's ETH balance
 * 3. Try calling the precompile from contract with Capability-1 executor
 * 4. Try encode addr(0) as executor directly in precompile call (not bypass path)
 */
import hre from "hardhat";
import {
  encodeAbiParameters,
  parseAbiParameters,
  decodeAbiParameters,
  hexToString,
  formatEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CONTRACT_ADDRESS = "0x04914ef2bcb2aea3f9e6c78a2d6a083cf040dd6f" as `0x${string}`;
const RITUAL_WALLET = "0x532F0dF0896F353d8C3DD8cc134e8129DA2a3948" as `0x${string}`;
const LLM_PRECOMPILE = "0x0000000000000000000000000000000000000802" as `0x${string}`;
const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as `0x${string}`;

// Capability-0 executors (HTTP_CALL / LLM)
const EXECUTOR_CAP0 = "0x833c7a5c0628b3d47d12c3556ac1b02b2723f390" as `0x${string}`;
// Capability-1 executor
const EXECUTOR_CAP1 = "0xec6a6c7ebd08616c805e18cdea6bf9c54950c77d" as `0x${string}`;

const RITUAL_WALLET_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: process.env.DEPLOYER_PRIVATE_KEY, type: "address" }], outputs: [{ type: "uint256" }] }
] as const;

function buildLlmInput(executorAddress: `0x${string}`, messagesJson: string): `0x${string}` {
  const llmParams = parseAbiParameters(
    "address, bytes[], uint256, bytes[], bytes, string, string, int256, string, bool, int256, string, string, uint256, bool, int256, string, bytes, int256, string, string, bool, int256, bytes, bytes, int256, int256, string, bool, (string,string,string)"
  );
  return encodeAbiParameters(llmParams, [
    executorAddress, [], 300n, [], "0x",
    messagesJson,
    "zai-org/GLM-4.7-FP8",
    0n, process.env.DEPLOYER_PRIVATE_KEY, false, 512n, process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY, 1n, false, 0n, process.env.DEPLOYER_PRIVATE_KEY, "0x",
    -1n, process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY, false, 100n, "0x", "0x", -1n, 1000n, process.env.DEPLOYER_PRIVATE_KEY, false,
    [process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY],
  ]);
}

async function testPrecompileCall(client: any, account: any, executorAddr: `0x${string}`, label: string) {
  console.log(`\n  Testing executor: ${label} (${executorAddr})`);
  const messages = JSON.stringify([
    { role: "user", content: "Say: RITUAL LLM WORKS" }
  ]);
  const input = buildLlmInput(executorAddr, messages);
  try {
    const res = await client.call({
      account: account.address,
      to: LLM_PRECOMPILE,
      data: input,
      gas: 5_000_000n,
    });
    if (!res.data || res.data === "0x") {
      console.log(`    → No data returned`);
      return;
    }
    const [, actualOutput] = decodeAbiParameters(parseAbiParameters("bytes, bytes"), res.data);
    if (!actualOutput || actualOutput === "0x") {
      console.log(`    → actualOutput is empty (TEE executor returned nothing)`);
      return;
    }
    try {
      const [hasError, completionData, , errorMsg] = decodeAbiParameters(
        parseAbiParameters("bool, bytes, bytes, string, (string,string,string)"),
        actualOutput
      );
      console.log(`    ✅ SUCCESS! hasError=${hasError}, errorMsg="${errorMsg}"`);
      if (completionData && (completionData as `0x${string}`) !== "0x") {
        console.log(`    completion: ${hexToString(completionData as `0x${string}`)}`);
      }
    } catch {
      console.log(`    → Could not decode actualOutput: ${(actualOutput as string).slice(0, 64)}...`);
    }
  } catch (e: any) {
    console.log(`    ❌ Failed: ${e.shortMessage || e.message?.slice(0, 120)}`);
  }
}

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const ownerAccount = privateKeyToAccount(key1);

  console.log("═".repeat(64));
  console.log("  LLM PRECOMPILE DIAGNOSIS");
  console.log("═".repeat(64));

  // 1. Check balances
  const contractEthBal = await client.getBalance({ address: CONTRACT_ADDRESS });
  console.log(`\nContract ETH balance: ${formatEther(contractEthBal)} RITUAL`);

  // Check RitualWallet balance for contract
  try {
    const ritualWalletContract = { address: RITUAL_WALLET, abi: RITUAL_WALLET_ABI };
    const contractRitualBal = await client.readContract({
      ...ritualWalletContract,
      functionName: "balanceOf",
      args: [CONTRACT_ADDRESS],
    });
    console.log(`Contract RitualWallet balance: ${formatEther(contractRitualBal as bigint)} RITUAL`);
  } catch (e: any) {
    console.log("Could not read RitualWallet balance:", e.message?.slice(0, 100));
  }

  // 2. Test different executors as EOA (eth_call)
  console.log("\n─── EOA eth_call tests ───");
  await testPrecompileCall(client, ownerAccount, EXECUTOR_CAP0, "Capability-0 executor");
  await testPrecompileCall(client, ownerAccount, EXECUTOR_CAP1, "Capability-1 executor");

  // 3. Check TEERegistry for Capability 2 explicitly
  console.log("\n─── Checking TEERegistry capabilities 1 and 5 ───");
  const caps = [0, 1, 5, 7, 8, 9];
  for (const cap of caps) {
    const sel = "069a031b";
    const capHex = cap.toString(16).padStart(64, "0");
    const boolHex = "1".padStart(64, "0");
    const data = `0x${sel}${capHex}${boolHex}` as `0x${string}`;
    const raw = await client.call({ to: TEE_REGISTRY, data });
    if (!raw.data || raw.data === "0x") {
      console.log(`  Cap ${cap}: no data`);
      continue;
    }
    const hex = raw.data.slice(2);
    if (hex.length < 128) { console.log(`  Cap ${cap}: too short`); continue; }
    const arrayLength = parseInt(hex.slice(64, 128), 16);
    if (arrayLength === 0) { console.log(`  Cap ${cap}: 0 executors`); continue; }
    console.log(`  Cap ${cap}: ${arrayLength} executor(s)`);
    for (let i = 0; i < Math.min(arrayLength, 3); i++) {
      const offsetWordStart = (2 + i) * 64;
      const elementOffset = parseInt(hex.slice(offsetWordStart, offsetWordStart + 64), 16);
      const elementStartChar = 64 + elementOffset * 2;
      const teeAddrWord = hex.slice(elementStartChar + 4 * 64, elementStartChar + 5 * 64);
      const teeAddress = "0x" + teeAddrWord.slice(24);
      console.log(`    [${i}]: ${teeAddress}`);
      if (teeAddress !== "0x0000000000000000000000000000000000000000") {
        await testPrecompileCall(client, ownerAccount, teeAddress as `0x${string}`, `Cap-${cap} executor`);
      }
    }
  }
}

main().catch(console.error);
