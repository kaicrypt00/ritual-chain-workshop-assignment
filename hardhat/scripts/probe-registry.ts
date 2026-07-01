/**
 * Deep probe of TEEServiceRegistry to find the correct struct layout.
 * 
 * Key findings so far:
 * - getServicesByCapability(2, true/false) → succeeds, returns 0 items
 * - getServicesByCapability(0, true/false) → "Position X out of bounds" — wrong struct
 * - bytecode: 141 bytes → likely a minimal proxy pointing to implementation
 *
 * Strategy: Try many struct shapes for capabilities 0 and 1 to find the right ABI.
 */

import hre from "hardhat";
import { keccak256, toHex } from "viem";

const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as const;
const SOVEREIGN_FACTORY = "0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304" as const;

async function rawCall(client: any, to: string, data: `0x${string}`) {
  try {
    const res = await client.call({ to, data });
    return res.data as `0x${string}` | undefined;
  } catch (e: any) {
    return undefined;
  }
}

// Compute function selector
function sel(sig: string): `0x${string}` {
  const hash = keccak256(toHex(sig, { size: undefined as any }));
  return ("0x" + hash.slice(2, 10)) as `0x${string}`;
}

// Pad uint256 to 32 bytes
function u256(n: bigint): string {
  return n.toString(16).padStart(64, "0");
}
function u8(n: number): string { return n.toString(16).padStart(64, "0"); }
function bool(b: boolean): string { return b ? u256(1n) : u256(0n); }

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const client = await connection.viem.getPublicClient();

  console.log("═".repeat(60));
  console.log("TEE REGISTRY DEEP PROBE");
  console.log("═".repeat(60));

  // Check if it's a proxy — look for implementation() slot
  const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
  const impl = await client.getStorageAt({ address: TEE_REGISTRY, slot: implSlot });
  if (impl && impl !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
    const implAddr = "0x" + impl.slice(26);
    console.log(`✅ UUPS proxy detected! Implementation: ${implAddr}`);
    
    // Get implementation bytecode size
    const implCode = await client.getBytecode({ address: implAddr as `0x${string}` });
    console.log(`   Implementation bytecode: ${implCode ? (implCode.length - 2) / 2 : 0} bytes`);
    console.log();
    
    // Now probe the implementation directly for function signatures
    console.log("Probing implementation for capability functions:");
    const sigs = [
      "getServicesByCapability(uint8,bool)",
      "getServicesByCapability(uint8,bool,uint256)",
      "pickServiceByCapability(uint8,bool,uint256,uint256)",
      "pickServiceByCapability(uint8,bool,uint256)",
      "getServices(uint8)",
      "getServices(uint8,bool)",
      "getExecutors(uint8)",
      "getActiveExecutors(uint8)",
      "getCapabilityServices(uint8)",
    ];
    
    for (const sig of sigs) {
      const selector = sel(sig);
      console.log(`  ${sig} → selector: ${selector}`);
    }
    console.log();
  }

  // ─── Probe with different struct layouts for capability 0 ─────────────────
  console.log("Probing getServicesByCapability with capability 0:");
  
  const funcSel = sel("getServicesByCapability(uint8,bool)");
  
  // Call with capability=0, activeOnly=true
  const calldata0 = (funcSel + u8(0) + bool(true)) as `0x${string}`;
  const raw0 = await rawCall(client, TEE_REGISTRY, calldata0);
  if (raw0) {
    console.log(`Raw response for cap=0: ${raw0.slice(0, 500)}`);
    console.log(`Response length: ${(raw0.length - 2) / 2} bytes`);
  } else {
    console.log("  cap=0: no response / revert");
  }

  // Call with capability=2, activeOnly=true — known to work
  const calldata2 = (funcSel + u8(2) + bool(true)) as `0x${string}`;
  const raw2 = await rawCall(client, TEE_REGISTRY, calldata2);
  if (raw2) {
    console.log(`\nRaw response for cap=2: ${raw2}`);
    console.log(`Response length: ${(raw2.length - 2) / 2} bytes`);
    // An empty array is encoded as: offset=32, length=0 → 0x0000...20 0000...0
    // So empty array = 64 bytes (2 words: offset + length)
    const decoded = raw2 === "0x0000000000000000000000000000000000000000000000000000000000000020" +
                             "0000000000000000000000000000000000000000000000000000000000000000";
    console.log(`  Is empty array? ${decoded}`);
  }

  // Try capability=0, activeOnly=false  
  const calldata0f = (funcSel + u8(0) + bool(false)) as `0x${string}`;
  const raw0f = await rawCall(client, TEE_REGISTRY, calldata0f);
  if (raw0f) {
    console.log(`\nRaw response for cap=0, active=false:`);
    console.log(`  ${raw0f.slice(0, 300)}`);
    console.log(`  length: ${(raw0f.length - 2) / 2} bytes`);
    
    // Try to decode first word as uint256 (array offset)
    const firstWord = BigInt("0x" + raw0f.slice(2, 66));
    const secondWord = BigInt("0x" + raw0f.slice(66, 130));
    console.log(`  first word (array offset): ${firstWord}`);
    console.log(`  second word (array length): ${secondWord}`);
    
    if (secondWord > 0n && secondWord < 100n) {
      console.log(`  → Array has ${secondWord} elements!`);
      // Try to decode as different struct sizes
      const totalData = raw0f.slice(2);
      const bytesPerWord = 32;
      const headerWords = 2; // offset + length
      const remainingData = totalData.slice(headerWords * bytesPerWord * 2);
      console.log(`  Remaining data (${remainingData.length / 2} bytes): ${remainingData.slice(0, 400)}`);
    }
  }

  // ─── Check SovereignFactory connection to registry ─────────────────────────
  console.log("\n" + "─".repeat(60));
  console.log("SovereignFactory wiring check:");
  
  const factoryCode = await client.getBytecode({ address: SOVEREIGN_FACTORY });
  if (factoryCode && factoryCode !== "0x") {
    console.log(`✅ SovereignFactory exists (${(factoryCode.length - 2) / 2} bytes)`);
    
    const fAbi = [
      { name: "teeRegistry",   type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
      { name: "ritualWallet",  type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
      { name: "asyncDelivery", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
      { name: "scheduler",     type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
    ] as const;
    
    for (const fn of ["teeRegistry", "ritualWallet", "asyncDelivery", "scheduler"] as const) {
      try {
        const addr = await client.readContract({ address: SOVEREIGN_FACTORY, abi: fAbi, functionName: fn });
        console.log(`  ${fn}(): ${addr}`);
      } catch (e: any) {
        console.log(`  ${fn}(): FAILED`);
      }
    }

    // Ask factory to pick an executor
    const pickSel = sel("pickServiceByCapability(uint8,bool,uint256,uint256)");
    const pickData = (pickSel + u8(0) + bool(true) + u256(12345n) + u256(1n)) as `0x${string}`;
    
    // Call factory's teeRegistry address with the pick function
    // We'll also directly ask the factory for a resolved executor using its internal method
    // by checking known selectors
    
  } else {
    console.log("❌ SovereignFactory not found");
  }

  console.log("\n" + "═".repeat(60));
}

main().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});
