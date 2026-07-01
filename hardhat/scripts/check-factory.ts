/**
 * Check SovereignAgentFactory wiring to discover correct system contract addresses.
 * Factory: 0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304
 */
import hre from "hardhat";
import { parseAbiParameters, encodeAbiParameters } from "viem";

const SOVEREIGN_FACTORY = "0x9dC4C054e53bCc4Ce0A0Ff09E890A7a8e817f304" as const;
const TEE_REGISTRY      = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as const;

const factoryAbi = [
  { name: "teeRegistry",  type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "ritualWallet", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "asyncDelivery",type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { name: "scheduler",    type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

// TEEServiceRegistry — correct interface from dapp-skills reference
const registryAbi = [
  {
    name: "getServicesByCapability",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "capability", type: "uint8" },
      { name: "activeOnly", type: "bool" },
    ],
    outputs: [{
      name: process.env.DEPLOYER_PRIVATE_KEY,
      type: "tuple[]",
      components: [
        { name: "teeAddress", type: "address" },
        { name: "publicKey",  type: "bytes" },
      ],
    }],
  },
  {
    name: "pickServiceByCapability",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "capability", type: "uint8" },
      { name: "activeOnly", type: "bool" },
      { name: "seed",       type: "uint256" },
      { name: "n",          type: "uint256" },
    ],
    outputs: [{
      name: process.env.DEPLOYER_PRIVATE_KEY,
      type: "tuple[]",
      components: [
        { name: "teeAddress", type: "address" },
        { name: "publicKey",  type: "bytes" },
      ],
    }],
  },
] as const;

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const client = await connection.viem.getPublicClient();

  console.log("═".repeat(60));
  console.log("FACTORY + REGISTRY CHECK");
  console.log("═".repeat(60));

  // 1. Verify factory exists
  const factoryCode = await client.getBytecode({ address: SOVEREIGN_FACTORY });
  console.log(`SovereignFactory (${SOVEREIGN_FACTORY})`);
  console.log(`  bytecode: ${factoryCode && factoryCode !== "0x" ? `${(factoryCode.length - 2) / 2} bytes ✅` : "NOT FOUND ❌"}`);

  // 2. Read wiring from factory
  console.log("\nFactory wiring:");
  for (const fn of ["teeRegistry", "ritualWallet", "asyncDelivery", "scheduler"] as const) {
    try {
      const addr = await client.readContract({ address: SOVEREIGN_FACTORY, abi: factoryAbi, functionName: fn });
      console.log(`  ${fn}(): ${addr}`);
    } catch (e: any) {
      console.log(`  ${fn}(): FAILED — ${e.shortMessage?.slice(0, 60) || "unknown"}`);
    }
  }

  // 3. Query registry with the correct function
  console.log("\nTEEServiceRegistry executor discovery:");
  const registryAddr = TEE_REGISTRY;

  // Try getServicesByCapability for capabilities 0, 1, 2
  for (const cap of [0, 1, 2] as const) {
    for (const active of [true, false]) {
      try {
        const svcs = await client.readContract({
          address: registryAddr,
          abi: registryAbi,
          functionName: "getServicesByCapability",
          args: [cap, active],
        }) as Array<{ teeAddress: string; publicKey: string }>;

        if (svcs.length > 0) {
          console.log(`\n  ✅ getServicesByCapability(${cap}, ${active}) → ${svcs.length} executor(s):`);
          for (const svc of svcs) {
            console.log(`     teeAddress: ${svc.teeAddress}`);
            console.log(`     publicKey : ${svc.publicKey.slice(0, 68)}...`);
          }
        } else {
          console.log(`  getServicesByCapability(${cap}, ${active}): 0 executors`);
        }
      } catch (e: any) {
        console.log(`  getServicesByCapability(${cap}, ${active}): ${e.shortMessage?.slice(0, 70) || "failed"}`);
      }
    }
  }

  // Try pickServiceByCapability
  try {
    const picked = await client.readContract({
      address: registryAddr,
      abi: registryAbi,
      functionName: "pickServiceByCapability",
      args: [0, true, BigInt(Date.now()), 1n],
    }) as Array<{ teeAddress: string; publicKey: string }>;

    if (picked.length > 0) {
      console.log(`\n  ✅ pickServiceByCapability(0, true, seed, 1):`);
      console.log(`     teeAddress: ${picked[0].teeAddress}`);
    }
  } catch (e: any) {
    console.log(`  pickServiceByCapability: ${e.shortMessage?.slice(0, 80) || "failed"}`);
  }

  // 4. Raw storage slot reads on the registry to peek at stored data
  console.log("\nRaw storage slot reads (slot 0–3):");
  for (let slot = 0n; slot < 4n; slot++) {
    try {
      const val = await client.getStorageAt({ address: registryAddr, slot });
      if (val && val !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
        console.log(`  slot[${slot}]: ${val}`);
      }
    } catch { /* skip */ }
  }

  console.log("\n" + "═".repeat(60));
}

main().catch((e) => {
  console.error("❌", e.message || e);
  process.exit(1);
});
