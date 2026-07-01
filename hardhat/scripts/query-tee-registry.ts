/**
 * Query TEEServiceRegistry for registered LLM executors.
 *
 * Correct interface (from ritual-dapp-skills reference):
 *   - getServicesByCapability(uint8 capability, bool activeOnly) → ServiceNode[]
 *   - pickServiceByCapability(uint8 capability, bool activeOnly, uint256 seed, uint256 n)
 *
 * Capability IDs:
 *   0 = HTTP_CALL  (also covers LLM 0x0802, Sovereign Agent 0x080C, Persistent Agent 0x0820)
 *   1 = LLM (if a separate capability exists)
 *
 * ServiceNode struct (expected):
 *   address teeAddress
 *   bytes   publicKey
 *   uint8   capability  (may vary)
 *   bool    active
 */

import hre from "hardhat";
import { encodeAbiParameters, parseAbiParameters, decodeAbiParameters } from "viem";

const TEE_REGISTRY = "0x9644e8562cE0Fe12b4deeC4163c064A8862Bf47F" as const;

// ─── ABI for the correct interface ───────────────────────────────────────────
const registryAbi = [
  // getServicesByCapability(uint8 capability, bool activeOnly)
  {
    name: "getServicesByCapability",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "capability", type: "uint8" },
      { name: "activeOnly", type: "bool" },
    ],
    outputs: [
      {
        name: process.env.DEPLOYER_PRIVATE_KEY,
        type: "tuple[]",
        components: [
          { name: "teeAddress", type: "address" },
          { name: "publicKey", type: "bytes" },
        ],
      },
    ],
  },
  // pickServiceByCapability(uint8 capability, bool activeOnly, uint256 seed, uint256 n)
  {
    name: "pickServiceByCapability",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "capability", type: "uint8" },
      { name: "activeOnly", type: "bool" },
      { name: "seed", type: "uint256" },
      { name: "n", type: "uint256" },
    ],
    outputs: [
      {
        name: process.env.DEPLOYER_PRIVATE_KEY,
        type: "tuple[]",
        components: [
          { name: "teeAddress", type: "address" },
          { name: "publicKey", type: "bytes" },
        ],
      },
    ],
  },
  // getServices() - generic fallback
  {
    name: "getServices",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: process.env.DEPLOYER_PRIVATE_KEY,
        type: "tuple[]",
        components: [
          { name: "teeAddress", type: "address" },
          { name: "publicKey", type: "bytes" },
        ],
      },
    ],
  },
] as const;

// ─── Raw selector probes ──────────────────────────────────────────────────────
// Brute-force probe selectors to find what the registry actually responds to.
const SELECTORS = [
  // getServicesByCapability(uint8,bool) — from dapp-skills reference
  { sig: "getServicesByCapability(uint8,bool)",      sel: "0x98be0e50" },
  // pickServiceByCapability(uint8,bool,uint256,uint256)
  { sig: "pickServiceByCapability(uint8,bool,uint256,uint256)", sel: "0x6dc7a60f" },
  // getServices()
  { sig: "getServices()",                            sel: "0x5fc17a8b" },
  // getExecutors()
  { sig: "getExecutors()",                           sel: "0xe7ab8e49" },
  // getAllExecutors()
  { sig: "getAllExecutors()",                         sel: "0x15a3e0a4" },
  // executorCount()
  { sig: "executorCount()",                          sel: "0x6d04e3d5" },
  // getExecutorCount()
  { sig: "getExecutorCount()",                       sel: "0x83c22c5f" },
];

async function rawCall(client: any, to: string, data: string): Promise<string | null> {
  try {
    const res = await client.call({ to, data });
    if (res.data && res.data !== "0x" && res.data.length > 2) {
      return res.data;
    }
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const connection = await (hre.network as any).getOrCreate();
  const viem = connection.viem;
  const client = await viem.getPublicClient();

  console.log("═".repeat(60));
  console.log("TEE SERVICE REGISTRY PROBE");
  console.log("═".repeat(60));
  console.log("Registry :", TEE_REGISTRY);
  console.log("RPC      :", "https://rpc.ritualfoundation.org");
  console.log();

  const code = await client.getBytecode({ address: TEE_REGISTRY });
  if (!code || code === "0x") {
    console.log("❌ No code at TEE_REGISTRY");
    return;
  }
  console.log(`✅ Contract exists — bytecode size: ${(code.length - 2) / 2} bytes`);
  console.log();

  // ── Phase 1: raw selector brute force ─────────────────────────────────────
  console.log("Phase 1 — Raw selector probe:");
  console.log("─".repeat(60));
  for (const { sig, sel } of SELECTORS) {
    // For getServicesByCapability, pass (0, true) = capability 0, active only
    let calldata = sel as `0x${string}`;
    if (sig.includes("uint8,bool")) {
      // capability=0 (1 byte padded), activeOnly=true (1 word)
      calldata = (sel + "0000000000000000000000000000000000000000000000000000000000000000" +
                        "0000000000000000000000000000000000000000000000000000000000000001") as `0x${string}`;
    }
    if (sig.includes("uint256,uint256")) {
      // capability=0, activeOnly=true, seed=12345, n=1
      calldata = (sel + "0000000000000000000000000000000000000000000000000000000000000000" +
                        "0000000000000000000000000000000000000000000000000000000000000001" +
                        "0000000000000000000000000000000000000000000000000000000000003039" +
                        "0000000000000000000000000000000000000000000000000000000000000001") as `0x${string}`;
    }
    const result = await rawCall(client, TEE_REGISTRY, calldata);
    if (result) {
      console.log(`✅ ${sig}`);
      console.log(`   Selector: ${sel}`);
      console.log(`   Response (first 200): ${result.slice(0, 200)}`);
      console.log();
    } else {
      console.log(`   ${sig}: no response`);
    }
  }

  // ── Phase 2: typed ABI calls ───────────────────────────────────────────────
  console.log();
  console.log("Phase 2 — Typed ABI calls:");
  console.log("─".repeat(60));

  // Try getServicesByCapability(0, true) — HTTP_CALL capability, active only
  for (const capability of [0, 1, 2] as const) {
    for (const activeOnly of [true, false]) {
      try {
        const services = await client.readContract({
          address: TEE_REGISTRY,
          abi: registryAbi,
          functionName: "getServicesByCapability",
          args: [capability, activeOnly],
        }) as any[];
        console.log(`\n✅ getServicesByCapability(${capability}, ${activeOnly}) → ${services.length} service(s)`);
        for (const svc of services) {
          console.log(`   teeAddress : ${svc.teeAddress}`);
          console.log(`   publicKey  : ${(svc.publicKey as string)?.slice(0, 40)}...`);
        }
      } catch (e: any) {
        console.log(`   getServicesByCapability(${capability}, ${activeOnly}): ${e.shortMessage?.slice(0, 60) || "failed"}`);
      }
    }
  }

  // Try pickServiceByCapability(0, true, seed, 1)
  try {
    const picked = await client.readContract({
      address: TEE_REGISTRY,
      abi: registryAbi,
      functionName: "pickServiceByCapability",
      args: [0, true, 12345n, 1n],
    }) as any[];
    console.log(`\n✅ pickServiceByCapability(0, true, 12345, 1) → ${picked.length} result(s)`);
    for (const svc of picked) {
      console.log(`   teeAddress : ${svc.teeAddress}`);
      console.log(`   publicKey  : ${(svc.publicKey as string)?.slice(0, 40)}...`);
    }
  } catch (e: any) {
    console.log(`   pickServiceByCapability: ${e.shortMessage?.slice(0, 80) || "failed"}`);
  }

  // Try getServices()
  try {
    const all = await client.readContract({
      address: TEE_REGISTRY,
      abi: registryAbi,
      functionName: "getServices",
    }) as any[];
    console.log(`\n✅ getServices() → ${all.length} service(s)`);
    for (const svc of all) {
      console.log(`   teeAddress : ${svc.teeAddress}`);
    }
  } catch (e: any) {
    console.log(`   getServices(): ${e.shortMessage?.slice(0, 80) || "failed"}`);
  }

  console.log();
  console.log("═".repeat(60));
}

main().catch((e) => {
  console.error("❌ Failed:", e.message || e);
  process.exit(1);
});
