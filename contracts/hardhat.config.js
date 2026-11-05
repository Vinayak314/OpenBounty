require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { ETHERSCAN_API_KEY, PRIVATE_KEY, WHITECHAIN_RPC_URL } = process.env;

// Hardhat validates every network entry at load time, so an unset/blank key
// must produce an empty accounts list instead of "0xundefined".
function normalizeKey(key) {
  if (!key) return [];
  return [key.startsWith("0x") ? key : `0x${key}`];
}
const deployerAccounts = normalizeKey(PRIVATE_KEY);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      // Whitechain Sepolia executes PUSH0 / MCOPY / TSTORE (probed with eth_call
      // against https://rpc.testnet.whitechain.io on 2026-11-06), so cancun is safe.
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  paths: {
    sources: "./contracts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    // Whitechain Sepolia (L2 on Ethereum Sepolia). Source: docs.whitechain.io/learn/network/testnet
    whitechainSepolia: {
      url: WHITECHAIN_RPC_URL || "https://rpc.testnet.whitechain.io",
      chainId: 1874,
      accounts: deployerAccounts,
    },
  },
  // The explorer is Blockscout (its Etherscan-compatible /api answers getabi).
  // The Whitechain docs do not document a verification flow, so this config is
  // a best-effort guess: confirm with `npx hardhat verify` after the first deploy.
  etherscan: {
    apiKey: {
      whitechainSepolia: ETHERSCAN_API_KEY || "blockscout-does-not-need-a-key",
    },
    customChains: [
      {
        network: "whitechainSepolia",
        chainId: 1874,
        urls: {
          apiURL: "https://explorer.testnet.whitechain.io/api",
          browserURL: "https://explorer.testnet.whitechain.io",
        },
      },
    ],
  },
  sourcify: { enabled: false },
};
