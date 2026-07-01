const { ethers } = require("ethers");

async function main() {
  const provider = new ethers.JsonRpcProvider("https://rpc.ritualfoundation.org");
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  console.log("Wallet address:", wallet.address);
  
  const balance = await provider.getBalance(wallet.address);
  console.log("Wallet balance:", ethers.formatEther(balance), "RITUAL");

  // Check code of deployed contract
  const code = await provider.getCode("0x02a8583e951cf109D5cF09E1DEb7F1839d98E035");
  console.log("Bytecode length of 0x02a8583e951cf109D5cF09E1DEb7F1839d98E035:", code ? code.length : 0);
}

main().catch(console.error);
