/* eslint-disable no-console */
// Starts the two-step ownership transfer of the escrow to a new owner (normally the project owner's passkey
// account). The new owner completes it from the OpenBounty app ("Accept escrow ownership"), sponsored.
//
//   ESCROW_ADDRESS=0x... NEW_OWNER_ADDRESS=0x... npx hardhat run scripts/transferOwnership.js --network whitechainSepolia
const hre = require("hardhat");

const { ethers } = hre;

async function main() {
  const escrowAddress = ethers.getAddress(process.env.ESCROW_ADDRESS || "");
  const newOwner = ethers.getAddress(process.env.NEW_OWNER_ADDRESS || "");
  const [current] = await ethers.getSigners();
  const escrow = await ethers.getContractAt("BountyEscrow", escrowAddress);
  if ((await escrow.owner()) !== current.address) throw new Error("PRIVATE_KEY is not the current escrow owner.");
  if ((await escrow.attestationSigner()) === newOwner) throw new Error("The new owner must not be the attestation signer.");
  const tx = await escrow.transferOwnership(newOwner);
  await tx.wait();
  console.log("Pending owner set:", newOwner, "tx", tx.hash);
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
