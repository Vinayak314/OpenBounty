const { Interface, getAddress } = require("ethers");
const { ESCROW_ABI, ERC20_ABI, FACTORY_ABI } = require("./abi");

// Gas-sponsor allowlist. The backend builds every batch itself; this check is defense in depth so that
// nothing outside these contracts and functions can ever be paid for by the sponsor.
const escrowIface = new Interface(ESCROW_ABI);
const erc20Iface = new Interface(ERC20_ABI);
const factoryIface = new Interface(FACTORY_ABI);

const ESCROW_FUNCTIONS = new Set([
  "fund", "acceptClaim", "expireClaim", "registerSubmission", "settle", "refund", "cancelByAgreement",
  "setMaintainer", "setSettlementWallet", "setAutoPayoutAgent", "acceptOwnership", "invalidateNonce",
]);

class PolicyError extends Error {
  constructor(message) { super(message); this.code = "sponsor_policy"; }
}

const same = (a, b) => Boolean(a && b) && getAddress(a) === getAddress(b);

/**
 * Validates calls a passkey account will make (inner calls of `execute`).
 * @param {{target:string,value:bigint|string|number,data:string}[]} calls
 * @param {{escrow:string, token:string, maxAmount:bigint}} config
 */
function assertAllowedAccountCalls(calls, { escrow, token, maxAmount }) {
  if (!Array.isArray(calls) || calls.length < 1 || calls.length > 4) throw new PolicyError("Unsupported batch size.");
  for (const call of calls) {
    if (BigInt(call.value || 0) !== 0n) throw new PolicyError("Sponsored calls cannot move the gas token.");
    if (same(call.target, token)) {
      const parsed = erc20Iface.parseTransaction({ data: call.data });
      if (parsed?.name !== "approve") throw new PolicyError("Only token approvals to the escrow are sponsored.");
      if (!same(parsed.args.spender, escrow)) throw new PolicyError("Token approvals must name the escrow.");
      if (parsed.args.amount > maxAmount) throw new PolicyError("Approval exceeds the sponsored limit.");
      continue;
    }
    if (same(call.target, escrow)) {
      const parsed = escrowIface.parseTransaction({ data: call.data });
      if (!parsed || !ESCROW_FUNCTIONS.has(parsed.name)) throw new PolicyError("That escrow function is not sponsored.");
      if (parsed.name === "fund" && parsed.args.terms.amount > maxAmount) throw new PolicyError("Bounty exceeds the sponsored limit.");
      continue;
    }
    throw new PolicyError("That contract is not sponsored.");
  }
}

/** Validates a transaction the sponsor itself sends (outer call). */
function assertAllowedSponsorTx({ to, data }, { escrow, factory, isAccount, autopay }) {
  if (same(to, factory)) {
    if (factoryIface.parseTransaction({ data })?.name !== "createAccount") throw new PolicyError("Only account creation is sponsored.");
    return "createAccount";
  }
  if (same(to, escrow)) {
    const parsed = escrowIface.parseTransaction({ data });
    const name = parsed?.name;
    // A direct `settle` is only the automatic payout: it must be approved by the configured auto-payout key.
    // Every human-approved settle goes through the approver's passkey account instead.
    if (name === "settle") {
      if (!autopay || !same(parsed.args.approval.signer, autopay)) throw new PolicyError("Only automatic payouts approved by the payout agent are sent directly.");
      return name;
    }
    if (!["registerSubmission", "expireClaim"].includes(name)) throw new PolicyError("Only backend attestations are sent directly.");
    return name;
  }
  if (isAccount) return "execute";
  throw new PolicyError("That contract is not sponsored.");
}

module.exports = { assertAllowedAccountCalls, assertAllowedSponsorTx, PolicyError, ESCROW_FUNCTIONS };
