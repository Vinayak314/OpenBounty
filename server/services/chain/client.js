const { JsonRpcProvider, Wallet, Contract, NonceManager, Interface } = require("ethers");
const { getChainConfig } = require("../../config/chain");
const { ESCROW_ABI, ACCOUNT_ABI, FACTORY_ABI, ERC20_ABI } = require("./abi");

let cached = null;

class ChainError extends Error {
  constructor(message, code = "chain_error", status = 503) { super(message); this.code = code; this.status = status; }
}

// One provider/wallet set per configuration. The sponsor key pays gas; the attestation key only signs.
function chain() {
  const config = getChainConfig();
  const key = [config.rpcUrl, config.chainId, config.escrow, config.accountFactory, config.token, config.sponsorKey, config.attestationKey].join("|");
  if (cached?.key === key) return cached.value;
  const provider = new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true });
  const sponsor = config.sponsorKey ? new NonceManager(new Wallet(config.sponsorKey, provider)) : null;
  const attester = config.attestationKey ? new Wallet(config.attestationKey) : null;
  if (sponsor && attester && new Wallet(config.sponsorKey).address === attester.address) {
    throw new ChainError("SPONSOR_PRIVATE_KEY and ATTESTATION_PRIVATE_KEY must be different keys.", "misconfigured");
  }
  const value = {
    config, provider, sponsor, attester,
    escrow: config.escrow ? new Contract(config.escrow, ESCROW_ABI, provider) : null,
    factory: config.accountFactory ? new Contract(config.accountFactory, FACTORY_ABI, provider) : null,
    token: new Contract(config.token, ERC20_ABI, provider),
    account: (address) => new Contract(address, ACCOUNT_ABI, provider),
  };
  cached = { key, value };
  return value;
}

function requirePayments() {
  const c = chain();
  if (!c.config.enabled) throw new ChainError("Payments are not configured on this server yet.", "payments_disabled");
  return c;
}

const interfaces = [ESCROW_ABI, ACCOUNT_ABI, FACTORY_ABI, ERC20_ABI].map((abi) => new Interface(abi));

const FRIENDLY = {
  NotMaintainer: "Your payment account does not hold the escrow maintainer role. Ask the project owner to grant it.",
  NotPayoutAuthority: "Your payment account is not allowed to approve payouts. The owner must grant the settlement permission.",
  BadStatus: "The bounty is not in the right state on chain for this action. Refresh and try again.",
  DeadlinePassed: "The submission deadline has passed.",
  ClaimHasExpired: "The claim expired before the submission was registered.",
  ClaimNotExpired: "The claim has not expired yet.",
  ClaimVersionMismatch: "The claim changed. Refresh and try again.",
  SelfPayment: "A funder or approver cannot pay themselves.",
  SettlementMismatch: "The payout facts do not match the funded agreement.",
  InvalidSignature: "The passkey signature was rejected on chain.",
  ExecutionExpired: "The approval expired. Start the action again.",
  NonceAlreadyUsed: "This authorization was already used.",
  BountyExists: "This bounty was already funded.",
  TokenNotAllowed: "The reward token is not allowlisted on the escrow.",
  ERC20InsufficientBalance: "Your payment account does not hold enough USDT.",
  ERC20InsufficientAllowance: "The escrow was not allowed to pull the USDT.",
  NotRefundAuthority: "Only the funder or a maintainer can return these funds.",
  PartiesNotDistinct: "The approver and the attestation signer must be different.",
  OwnableUnauthorizedAccount: "Only the escrow owner can do this.",
  InvalidPublicKey: "The passkey public key is not valid.",
};

/** Decodes a revert (including a nested CallFailed from a passkey account) into a readable message. */
function describeRevert(error) {
  const data = error?.data || error?.info?.error?.data || error?.error?.data || error?.revert?.data;
  const decode = (hex) => {
    for (const iface of interfaces) {
      try {
        const parsed = iface.parseError(hex);
        if (parsed) return parsed;
      } catch { /* try next */ }
    }
    return null;
  };
  let parsed = typeof data === "string" ? decode(data) : null;
  if (parsed?.name === "CallFailed") parsed = decode(parsed.args.reason) || parsed;
  if (parsed) return { name: parsed.name, message: FRIENDLY[parsed.name] || `The transaction would revert (${parsed.name}).` };
  if (error?.reason) return { name: "reason", message: `The transaction would revert: ${String(error.reason).slice(0, 200)}` };
  return { name: "unknown", message: "The transaction would revert." };
}

const explorerTx = (hash) => (hash ? `${chain().config.explorerUrl}/tx/${hash}` : "");
const explorerAddress = (address) => (address ? `${chain().config.explorerUrl}/address/${address}` : "");

module.exports = { chain, requirePayments, ChainError, describeRevert, explorerTx, explorerAddress };
