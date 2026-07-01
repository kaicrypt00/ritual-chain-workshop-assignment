import { keccak256, encodePacked } from "viem";

async function main() {
  const lowercaseSalt = process.env.DEPLOYER_PRIVATE_KEY;
  const uppercaseSalt = process.env.DEPLOYER_PRIVATE_KEY;

  const addr = "0x502998e87f363193da3a755bf441b122ecc1af33";
  const answer = "yes";
  const bountyId = 1n;

  const hash1 = keccak256(
    encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, lowercaseSalt, addr, bountyId]
    )
  );

  const hash2 = keccak256(
    encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer, uppercaseSalt, addr, bountyId]
    )
  );

  console.log("hash1:", hash1);
  console.log("hash2:", hash2);
  console.log("equal:", hash1 === hash2);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
