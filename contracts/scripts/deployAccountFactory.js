/* eslint-disable no-console */
// Deploys OpenBountyAccountFactory (passkey smart accounts). Deploy it BEFORE the escrow: account addresses
// depend on the factory address, and the escrow owner should be the project owner's passkey account.
//
//   npx hardhat run scripts/deployAccountFactory.js --network whitechainSepolia
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { ethers } = hre;

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 1874n && chainId !== 31337n) throw new Error(`Refusing to deploy on chain ${chainId}.`);
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("Set PRIVATE_KEY (a funded TEST key) in contracts/.env.");
  if ((await ethers.provider.getBalance(deployer.address)) === 0n) throw new Error("Deployer has no gas token; nothing was sent.");

  const factory = await (await ethers.getContractFactory("OpenBountyAccountFactory")).deploy();
  const receipt = await factory.deploymentTransaction().wait();
  const address = await factory.getAddress();
  console.log("OpenBountyAccountFactory:", address);

  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${hre.network.name}.accounts.json`);
  fs.writeFileSync(file, JSON.stringify({
    network: hre.network.name, chainId: Number(chainId), accountFactory: address, deployer: deployer.address,
    txHash: receipt.hash, blockNumber: receipt.blockNumber, deployedAt: new Date().toISOString(),
  }, null, 2) + "\n");
  console.log("Saved:", path.relative(process.cwd(), file));
  console.log("Set ACCOUNT_FACTORY_ADDRESS in server/.env, then create the owner's passkey account in the app");
  console.log("and deploy the escrow with OWNER_ADDRESS=<that account address>.");
  if (chainId === 1874n) {
    console.log(`Verify: npx hardhat verify --network ${hre.network.name} ${address}`);
  }
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
