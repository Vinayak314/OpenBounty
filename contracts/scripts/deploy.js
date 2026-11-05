/* eslint-disable no-console */
// Deploys BountyEscrow. Keys and addresses come from the environment (see .env.example);
// nothing secret is read from, or written to, a committed file.
//
//   npx hardhat run scripts/deploy.js --network whitechainSepolia
//
// Whitechain Sepolia (chain 1874) is locked to the designated test USDT; the mock token is only
// ever deployed on local networks.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const { ethers } = hre;

const WHITECHAIN_SEPOLIA_CHAIN_ID = 1874n;
const DESIGNATED_USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
const LOCAL_CHAIN_IDS = new Set([31337n]);

function addrList(name) {
  const raw = (process.env[name] || "").trim();
  if (!raw) return [];
  return raw.split(",").map((a) => ethers.getAddress(a.trim()));
}

function requireAddress(name) {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`${name} is required (see .env.example)`);
  return ethers.getAddress(v);
}

async function main() {
  const net = await ethers.provider.getNetwork();
  const chainId = net.chainId;
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account: set PRIVATE_KEY in contracts/.env (a funded TEST key, never a real one).");
  }
  const isWhitechain = chainId === WHITECHAIN_SEPOLIA_CHAIN_ID;
  const isLocal = LOCAL_CHAIN_IDS.has(chainId) || hre.network.name === "localhost";
  if (!isWhitechain && !isLocal) {
    throw new Error(`Refusing to deploy on chain ${chainId}: only Whitechain Sepolia (1874) and local networks are supported.`);
  }

  const owner = process.env.OWNER_ADDRESS ? requireAddress("OWNER_ADDRESS") : isLocal ? deployer.address : null;
  if (!owner) throw new Error("OWNER_ADDRESS is required: the repository/workspace owner wallet that will manage roles.");
  const attestationSigner = requireAddress("ATTESTATION_SIGNER_ADDRESS");
  if (attestationSigner === owner || attestationSigner === deployer.address) {
    throw new Error("ATTESTATION_SIGNER_ADDRESS must be a dedicated backend key, distinct from the owner and the deployer.");
  }

  console.log("Network:          ", hre.network.name, `(chain ${chainId})`);
  console.log("Deployer:         ", deployer.address);
  console.log("Owner:            ", owner);
  console.log("Attestation signer", attestationSigner);

  // Token selection and validation (read-only) before anything is sent.
  let token;
  let deployedMock = false;
  if (isWhitechain) {
    token = process.env.TOKEN_ADDRESS ? requireAddress("TOKEN_ADDRESS") : DESIGNATED_USDT;
    if (token.toLowerCase() !== DESIGNATED_USDT.toLowerCase()) {
      throw new Error(`On Whitechain Sepolia only the designated USDT ${DESIGNATED_USDT} is allowed (got ${token}).`);
    }
    const code = await ethers.provider.getCode(token);
    if (code === "0x") throw new Error(`No contract code at ${token} on this network; check the RPC and chain id.`);
  } else if (process.env.TOKEN_ADDRESS) {
    token = requireAddress("TOKEN_ADDRESS");
  }

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance: ", ethers.formatEther(balance), "(native gas token, WBT on Whitechain)");
  if (balance === 0n) {
    throw new Error("Deployer has no native gas token. Fund the TEST key from the Whitechain faucet first; nothing was sent.");
  }

  if (!token) {
    console.log("Local network: deploying MockUSDT (test-only token).");
    const mock = await (await ethers.getContractFactory("MockUSDT")).deploy();
    await mock.waitForDeployment();
    token = await mock.getAddress();
    deployedMock = true;
  }
  console.log("Reward token:     ", token);

  const Escrow = await ethers.getContractFactory("BountyEscrow");
  const escrow = await Escrow.deploy(owner, attestationSigner, [token]);
  const receipt = await escrow.deploymentTransaction().wait();
  const escrowAddress = await escrow.getAddress();
  console.log("BountyEscrow:     ", escrowAddress);

  // The deployer can only configure roles if it is also the owner; otherwise the owner does it.
  const maintainers = addrList("INITIAL_MAINTAINERS");
  const settlementWallets = addrList("INITIAL_SETTLEMENT_WALLETS");
  if ((maintainers.length || settlementWallets.length) && owner === deployer.address) {
    for (const m of maintainers) await (await escrow.setMaintainer(m, true)).wait();
    for (const s of settlementWallets) await (await escrow.setSettlementWallet(s, true)).wait();
    console.log("Granted roles:    ", { maintainers, settlementWallets });
  } else if (maintainers.length || settlementWallets.length) {
    console.log("Owner differs from deployer: the owner must call setMaintainer / setSettlementWallet:", {
      maintainers,
      settlementWallets,
    });
  }

  const record = {
    network: hre.network.name,
    chainId: Number(chainId),
    escrow: escrowAddress,
    token,
    tokenIsMock: deployedMock,
    owner,
    attestationSigner,
    deployer: deployer.address,
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    deployedAt: new Date().toISOString(),
    compiler: { solc: "0.8.28", optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "cancun" },
    constructorArgs: [owner, attestationSigner, [token]],
  };
  const dir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${hre.network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  console.log("Saved deployment record:", path.relative(process.cwd(), file));

  // hardhat verify cannot take an array argument on the command line, so write an args module.
  const argsFile = path.join(dir, `${hre.network.name}.args.js`);
  fs.writeFileSync(argsFile, `module.exports = ${JSON.stringify(record.constructorArgs, null, 2)};\n`);

  if (isWhitechain) {
    console.log(`Explorer: https://explorer.testnet.whitechain.io/address/${escrowAddress}`);
    console.log("Verify (best-effort config, see README):");
    console.log(
      `  npx hardhat verify --network ${hre.network.name} --constructor-args-path ${path.relative(process.cwd(), argsFile)} ${escrowAddress}`
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
