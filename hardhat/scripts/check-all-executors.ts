/**
 * Discover ALL registered (active or inactive) executors across all capabilities.
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
  console.log("ALL EXECUTOR DISCOVERY (ACTIVE & INACTIVE)");
  console.log("═".repeat(64));

  for (let cap = 0; cap < 15; cap++) {
    for (const active of [true, false]) {
      const raw = await client.call({
        to: TEE_REGISTRY,
        data: buildCalldata(cap, active),
      });

      if (!raw.data || raw.data === "0x") continue;

      const hex = raw.data.slice(2);
      if (hex.length < 128) continue;

      const arrayLength = parseInt(hex.slice(64, 128), 16);
      if (arrayLength === 0) continue;

      console.log(`Capability ${cap} (activeOnly=${active}) has ${arrayLength} executors:`);

      for (let i = 0; i < Math.min(3, arrayLength); i++) {
        const offsetWordStart = (2 + i) * 64;
        const elementOffset = parseInt(hex.slice(offsetWordStart, offsetWordStart + 64), 16);
        const elementStartChar = 64 + elementOffset * 2;
        const teeAddrWord = hex.slice(elementStartChar + 4 * 64, elementStartChar + 5 * 64);
        const teeAddress = "0x" + teeAddrWord.slice(24);
        console.log(`  - ${teeAddress}`);
      }
    }
  }
}

main().catch(console.error);
