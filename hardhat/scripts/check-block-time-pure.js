async function main() {
  const rpcUrl = "https://rpc.ritualfoundation.org";
  
  const postData = {
    jsonrpc: "2.0",
    method: "eth_getBlockByNumber",
    params: ["latest", false],
    id: 1
  };
  
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(postData)
  });
  
  const resJson = await response.json();
  const block = resJson.result;
  
  if (block) {
    const blockNum = parseInt(block.number, 16);
    const blockTs = parseInt(block.timestamp, 16);
    console.log("Current block number:", blockNum);
    console.log("Current block timestamp:", blockTs);
    console.log("Current block date (UTC):", new Date(blockTs * 1000).toISOString());
    console.log("Current local machine date (UTC):", new Date().toISOString());
  } else {
    console.log("No block found or RPC error:", resJson);
  }
}

main().catch(console.error);
