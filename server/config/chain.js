// Whitechain payment configuration. Read lazily so tests and env changes apply.
const { isAddress, getAddress } = require("ethers");

const DESIGNATED_USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};
const address = (value) => (value && isAddress(value.trim()) ? getAddress(value.trim()) : "");
// BigInt("0.5") throws; a bad value must fall back instead of crashing every payments route.
const big = (value, fallback) => {
  const text = String(value ?? "").trim();
  if (!text) return BigInt(fallback); // BigInt("") is 0n, which would silently zero a limit
  try {
    const parsed = BigInt(text);
    return parsed >= 0n ? parsed : BigInt(fallback);
  } catch {
    return BigInt(fallback);
  }
};
const list = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

function getChainConfig(env = process.env) {
  const chainId = int(env.WHITECHAIN_CHAIN_ID, 1874);
  const config = {
    chainId,
    networkName: chainId === 1874 ? "Whitechain Sepolia" : `Chain ${chainId}`,
    rpcUrl: env.WHITECHAIN_RPC_URL || "https://rpc.testnet.whitechain.io",
    explorerUrl: (env.WHITECHAIN_EXPLORER_URL || "https://explorer.testnet.whitechain.io").replace(/\/+$/, ""),
    escrow: address(env.ESCROW_ADDRESS),
    accountFactory: address(env.ACCOUNT_FACTORY_ADDRESS),
    token: address(env.USDT_ADDRESS) || DESIGNATED_USDT,
    tokenSymbol: "USDT",
    // Keys live only in the backend environment. The attestation key and the sponsor key must differ.
    sponsorKey: env.SPONSOR_PRIVATE_KEY || "",
    attestationKey: env.ATTESTATION_PRIVATE_KEY || "",
    indexerStartBlock: int(env.ESCROW_DEPLOY_BLOCK, 0),
    // Blocks to stay behind the head before indexing (shallow reorg protection).
    indexerConfirmations: Math.min(int(env.INDEXER_CONFIRMATIONS, 2), 64),
    indexerPollMs: Math.max(int(env.INDEXER_POLL_MS, 15000), 2000),
    indexerBatchBlocks: Math.min(Math.max(int(env.INDEXER_BATCH_BLOCKS, 5000), 100), 50000),
    // Passkeys are bound to the site's domain.
    rpId: env.WEBAUTHN_RP_ID || "localhost",
    rpName: env.WEBAUTHN_RP_NAME || "OpenBounty",
    origins: list(env.WEBAUTHN_ORIGINS || env.CLIENT_ORIGINS || "http://localhost:5173"),
    // Gas-sponsor abuse limits.
    sponsor: {
      userTxPerHour: int(env.SPONSOR_USER_TX_PER_HOUR, 12),
      userTxPerDay: int(env.SPONSOR_USER_TX_PER_DAY, 40),
      globalTxPerHour: int(env.SPONSOR_GLOBAL_TX_PER_HOUR, 200),
      maxGasPerTx: int(env.SPONSOR_MAX_GAS_PER_TX, 2500000),
      dailyBudgetWei: big(env.SPONSOR_DAILY_BUDGET_WEI, "500000000000000000"), // 0.5 WBT
      minBalanceWei: big(env.SPONSOR_MIN_BALANCE_WEI, "20000000000000000"), // 0.02 WBT
      maxBountyUnits: big(env.SPONSOR_MAX_BOUNTY_UNITS, "10000000000"), // 10,000 USDT
    },
  };
  config.enabled = env.PAYMENTS_ENABLED !== "false" && Boolean(config.escrow && config.accountFactory && config.sponsorKey && config.attestationKey);
  config.accountsEnabled = env.PAYMENTS_ENABLED !== "false" && Boolean(config.accountFactory);
  return config;
}

function publicChainConfig(config = getChainConfig()) {
  return {
    enabled: config.enabled,
    accountsEnabled: config.accountsEnabled,
    chainId: config.chainId,
    networkName: config.networkName,
    explorerUrl: config.explorerUrl,
    escrow: config.escrow,
    accountFactory: config.accountFactory,
    token: config.token,
    tokenSymbol: config.tokenSymbol,
    tokenDecimals: 6,
    rpId: config.rpId,
  };
}

module.exports = { getChainConfig, publicChainConfig, DESIGNATED_USDT };
