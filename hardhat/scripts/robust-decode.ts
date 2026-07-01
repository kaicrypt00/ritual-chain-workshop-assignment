/**
 * Robustly extract executor addresses from raw TEEServiceRegistry data.
 */

import hre from "hardhat";

const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as const;

function buildCalldata(cap: number, active: boolean): `0x${string}` {
  const sel = "069a031b";
  const capHex  = cap.toString(16).padStart(64, "0");
  const boolHex = active ? "1".padStart(64, "0") : "0".padStart(64, "0");
  return `0x${sel}${capHex}${boolHex}` as `0x${string}`;
}

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const client = await connection.viem.getPublicClient();

  console.log("═".repeat(64));
  console.log("ROBUST EXECUTOR DECODE");
  console.log("═".repeat(64));

  const raw = await client.call({
    to: TEE_REGISTRY,
    data: buildCalldata(2, false), // Capability 2 (LLM), all executors
  });

  if (!raw.data || raw.data === "0x") {
    console.log("❌ No data returned");
    return;
  }

  const hex = raw.data.slice(2);
  const arrayLength = parseInt(hex.slice(64, 128), 16);
  console.log(`Registered executors: ${arrayLength}`);

  const executors: string[] = [];

  for (let i = 0; i < arrayLength; i++) {
    // Offset array starts at word 2 (char 128)
    const offsetWordStart = (2 + i) * 64;
    const elementOffset = parseInt(hex.slice(offsetWordStart, offsetWordStart + 64), 16);
    
    // Element starts at word 1 (start of array data) + elementOffset bytes
    // Word 1 is byte 32 = char 64
    const elementStartChar = 64 + elementOffset * 2;
    
    // teeAddress is at word 4 of the element (offset 128 bytes = 256 hex chars)
    const teeAddrWord = hex.slice(elementStartChar + 4 * 64, elementStartChar + 5 * 64);
    const ownerWord = hex.slice(elementStartChar + 5 * 64, elementStartChar + 6 * 64);
    
    const teeAddress = "0x" + teeAddrWord.slice(24);
    const owner = "0x" + ownerWord.slice(24);
    
    console.log(`  Executor [${i}]:`);
    console.log(`     teeAddress: ${teeAddress}`);
    console.log(`     owner:      ${owner}`);
    
    if (teeAddress !== "0x0000000000000000000000000000000000000000") {
      executors.push(teeAddress);
    }
  }

  console.log(`\n✅ Successfully decoded ${executors.length} executors.`);
  if (executors.length > 0) {
    console.log(`RECOMMENDED EXECUTOR: ${executors[0]}`);
  }
}

main().catch(console.error);
