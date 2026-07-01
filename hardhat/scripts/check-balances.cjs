const { secp256k1 } = require("ethereum-cryptography/secp256k1");
const { keccak256 } = require("ethereum-cryptography/keccak");

// Derive address from private key manually in pure Node.js
function privateKeyToAddress(privateKeyHex) {
  const cleanKey = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
  const privateKeyBytes = Buffer.from(cleanKey, "hex");
  const publicKey = secp256k1.getPublicKey(privateKeyBytes, false);
  // Remove first byte (0x04 format indicator)
  const publicKeyHash = keccak256(Buffer.from(publicKey.slice(1)));
  // Address is last 20 bytes of the keccak256 hash of the public key
  const address = "0x" + Buffer.from(publicKeyHash.slice(-20)).toString("hex");
  return address;
}

async function getBalance(address) {
  const res = await fetch("https://rpc.ritualfoundation.org", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"]
    })
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const wei = BigInt(data.result);
  return Number(wei) / 1e18;
}

async function main() {
  const key1 = process.env.DEPLOYER_PRIVATE_KEY;
  const key2 = process.env.SUBMITTER_PRIVATE_KEY;

  // Derive address for key 1
  const addr1 = privateKeyToAddress(key1);
  const addr2 = privateKeyToAddress(key2);

  const bal1 = await getBalance(addr1);
  const bal2 = await getBalance(addr2);

  console.log("Wallet 1 Address:", addr1);
  console.log("Wallet 1 Balance:", bal1, "RITUAL");
  console.log("---");
  console.log("Wallet 2 Address:", addr2);
  console.log("Wallet 2 Balance:", bal2, "RITUAL");
}

main().catch(console.error);
