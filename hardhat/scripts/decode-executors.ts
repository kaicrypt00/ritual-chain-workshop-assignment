/**
 * Final executor discovery — using correct TEEService struct:
 *
 * struct TEEService {
 *     address teeAddress;   // static
 *     address owner;        // static
 *     uint8   teeType;      // static (0=DEBUG, 1=TDX)
 *     bytes   publicKey;    // dynamic
 *     string  metadata;     // dynamic
 *     bytes32 capabilityId; // static
 * }
 *
 * Fixed portion per element = 6 words (address, address, uint8, offset_bytes, offset_string, bytes32)
 *  = 192 bytes fixed header + dynamic data
 */

import hre from "hardhat";
import { decodeAbiParameters } from "viem";

const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as const;

// getServicesByCapability(uint8,bool)
function buildCalldata(cap: number, active: boolean): `0x${string}` {
  const sel = "069a031b";
  const capHex  = cap.toString(16).padStart(64, "0");
  const boolHex = active ? "1".padStart(64, "0") : "0".padStart(64, "0");
  return `0x${sel}${capHex}${boolHex}` as `0x${string}`;
}

// TEEService ABI tuple
const teeServiceTuple = {
  type: "tuple" as const,
  components: [
    { name: "teeAddress",   type: "address" },
    { name: "owner",        type: "address" },
    { name: "teeType",      type: "uint8"   },
    { name: "publicKey",    type: "bytes"   },
    { name: "metadata",     type: "string"  },
    { name: "capabilityId", type: "bytes32" },
  ],
};

const outputAbi = [{ ...teeServiceTuple, type: "tuple[]" as const }];

async function rawCall(client: any, to: string, data: `0x${string}`) {
  try {
    const res = await client.call({ to, data });
    return res.data as `0x${string}` | undefined;
  } catch { return undefined; }
}

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const client = await connection.viem.getPublicClient();

  console.log("═".repeat(64));
  console.log("FINAL EXECUTOR DISCOVERY");
  console.log("═".repeat(64));
  console.log();

  // Try all combinations of capability + activeOnly
  for (const cap of [0, 1, 2, 3] as const) {
    for (const active of [true, false]) {
      const calldata = buildCalldata(cap, active);
      const raw = await rawCall(client, TEE_REGISTRY, calldata);
      if (!raw || raw === "0x") {
        console.log(`cap=${cap}, active=${active}: no data`);
        continue;
      }

      // Try multiple struct shapes
      const shapes = [
        // Shape A: (address, address, uint8, bytes, string, bytes32)
        [{ ...teeServiceTuple, type: "tuple[]" as const }],
        // Shape B: (address, address, bytes, bytes32, uint8, bool)
        [{
          type: "tuple[]" as const,
          components: [
            { name: "teeAddress",   type: "address" },
            { name: "owner",        type: "address" },
            { name: "publicKey",    type: "bytes" },
            { name: "capabilityId", type: "bytes32" },
            { name: "teeType",      type: "uint8" },
            { name: "active",       type: "bool" },
          ],
        }],
        // Shape C: (address, bytes, address, uint8, bytes32)
        [{
          type: "tuple[]" as const,
          components: [
            { name: "teeAddress",   type: "address" },
            { name: "publicKey",    type: "bytes" },
            { name: "owner",        type: "address" },
            { name: "teeType",      type: "uint8" },
            { name: "capabilityId", type: "bytes32" },
          ],
        }],
        // Shape D: (address, address, uint8, bytes32, bytes, string) — capabilityId before dynamic
        [{
          type: "tuple[]" as const,
          components: [
            { name: "teeAddress",   type: "address" },
            { name: "owner",        type: "address" },
            { name: "teeType",      type: "uint8" },
            { name: "capabilityId", type: "bytes32" },
            { name: "publicKey",    type: "bytes" },
            { name: "metadata",     type: "string" },
          ],
        }],
      ];

      for (let s = 0; s < shapes.length; s++) {
        try {
          const [items] = decodeAbiParameters(shapes[s] as any, raw) as any;
          if (items && items.length > 0) {
            const first = items[0];
            // Check if teeAddress looks like a real address (not tiny number)
            const addr = first.teeAddress || first[0];
            if (addr && addr !== "0x0000000000000000000000000000000000000000") {
              const addrBigInt = BigInt(addr);
              if (addrBigInt > 0xfffn) { // real address (not a tiny offset)
                console.log(`\n✅ cap=${cap}, active=${active}, shape[${s}] → ${items.length} executor(s):`);
                for (let i = 0; i < Math.min(5, items.length); i++) {
                  const item = items[i];
                  console.log(`  [${i}]:`);
                  console.log(`     teeAddress:   ${item.teeAddress || item[0]}`);
                  if (item.owner) console.log(`     owner:        ${item.owner}`);
                  if (item.teeType !== undefined) console.log(`     teeType:      ${item.teeType}`);
                  if (item.publicKey) console.log(`     publicKey:    ${(item.publicKey as string).slice(0, 40)}...`);
                  if (item.capabilityId) console.log(`     capabilityId: ${item.capabilityId}`);
                }
                console.log(`\n🔑 EXECUTOR TO USE: ${items[0].teeAddress || items[0][0]}`);
              }
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  // Also try decoding element 0 manually from raw bytes
  // We know: element size = 512 bytes, element 0 starts at offset 0x0500 from array body
  console.log("\n─── Manual decode of element 0 ───");
  const raw0 = await rawCall(client, TEE_REGISTRY, buildCalldata(0, false));
  if (raw0 && raw0.length > 2) {
    const hex = raw0.slice(2);
    // Array body starts at word 1 (byte 32 = char 64)
    // Element 0 offset = 0x0500 = 1280 bytes from array body start
    // Element 0 absolute = byte 32 + 1280 = 1312 → char 2624 in hex
    const elem0Start = (32 + 0x0500) * 2; // in hex chars
    
    console.log(`Element 0 starts at hex char ${elem0Start} (byte ${elem0Start/2})`);
    console.log("Element 0 words:");
    for (let w = 0; w < 20; w++) {
      const wStart = elem0Start + w * 64;
      const word = hex.slice(wStart, wStart + 64);
      if (!word || word.length < 64) break;
      
      // Try to interpret
      const asAddr = "0x" + word.slice(24);
      const asUint = BigInt("0x" + word);
      const addrBig = BigInt(asAddr);
      
      let interpretation = process.env.DEPLOYER_PRIVATE_KEY;
      if (addrBig > 0x0001000000000000000000000000000000000000n) {
        interpretation = ` ← possible address: ${asAddr}`;
      } else if (asUint > 0n && asUint < 10000n) {
        interpretation = ` ← small uint: ${asUint}`;
      } else if (asUint > 100n && asUint < 0x3000n) {
        interpretation = ` ← offset: ${asUint} (0x${asUint.toString(16)})`;
      }
      
      console.log(`  word[${w.toString().padStart(2)}]: 0x${word}${interpretation}`);
    }
  }

  console.log("\n" + "═".repeat(64));
}

main().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});
