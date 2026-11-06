/* eslint-disable no-console */
// LOCAL NETWORKS ONLY: mints MockUSDT to an address so a local dry run can fund bounties.
// On Whitechain Sepolia the designated USDT is external and cannot be minted from here.
//
//   TOKEN_ADDRESS=0x... TO_ADDRESS=0x... AMOUNT=100 npx hardhat run scripts/mintMockUsdt.js --network localhost
const hre = require("hardhat");

const { ethers } = hre;

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  if (chainId !== 31337n) throw new Error(`Refusing to run on chain ${chainId}: this helper is for local networks only.`);
  const token = ethers.getAddress(process.env.TOKEN_ADDRESS || "");
  const to = ethers.getAddress(process.env.TO_ADDRESS || "");
  const amount = ethers.parseUnits(String(process.env.AMOUNT || "100"), 6);
  const mock = await ethers.getContractAt("MockUSDT", token);
  await (await mock.mint(to, amount)).wait();
  console.log(`Minted ${ethers.formatUnits(amount, 6)} test USDT to ${to}. Balance: ${ethers.formatUnits(await mock.balanceOf(to), 6)}`);
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
