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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postData)
  });
  const resJson = await response.json();
  console.log("Raw timestamp string:", resJson.result.timestamp);
}
main().catch(console.error);
