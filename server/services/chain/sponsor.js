const SponsoredTx = require("../../models/SponsoredTx");
const { chain, ChainError, describeRevert } = require("./client");
const { assertAllowedSponsorTx } = require("./policy");

// OpenBounty's gas sponsor. It pays WBT for allowlisted transactions only, with per-user and global limits,
// a daily spend budget and a minimum-balance floor. Users never hold or see the gas token.
let sendLock = Promise.resolve();
const HOUR = 3600 * 1000;

class SponsorError extends ChainError {
  constructor(message, code = "sponsor_unavailable", status = 503) { super(message, code, status); }
}

// Limit check + reservation are one serialized step, so a concurrent burst cannot all pass the check
// before any of its transactions is recorded. (Single-process; the record is also what other checks count.)
let reserveLock = Promise.resolve();

async function worstCaseCostWei() {
  const { config, provider } = chain();
  const fees = await provider.getFeeData().catch(() => null);
  const price = fees?.maxFeePerGas ?? fees?.gasPrice ?? 10_000_000_000n;
  return BigInt(config.sponsor.maxGasPerTx) * price;
}

async function reserve({ userUid, kind, to, account, bounty }) {
  const { config, provider, sponsor } = chain();
  if (!sponsor) throw new SponsorError("Gas sponsorship is not configured on this server.");
  const limits = config.sponsor;
  const previous = reserveLock;
  let release;
  reserveLock = new Promise((resolve) => { release = resolve; });
  try {
    await previous;
    const now = Date.now();
    const [userHour, userDay, globalHour, spent, balance, worst] = await Promise.all([
      userUid ? SponsoredTx.countDocuments({ userUid, createdAt: { $gt: new Date(now - HOUR) } }) : 0,
      userUid ? SponsoredTx.countDocuments({ userUid, createdAt: { $gt: new Date(now - 24 * HOUR) } }) : 0,
      SponsoredTx.countDocuments({ createdAt: { $gt: new Date(now - HOUR) } }),
      SponsoredTx.find({ createdAt: { $gt: new Date(now - 24 * HOUR) } }).select("costWei").lean(),
      provider.getBalance(await sponsor.getAddress()),
      worstCaseCostWei(),
    ]);
    if (userUid && (userHour >= limits.userTxPerHour || userDay >= limits.userTxPerDay)) {
      throw new SponsorError("You reached the sponsored-transaction limit. Try again later.", "sponsor_rate_limited", 429);
    }
    if (globalHour >= limits.globalTxPerHour) throw new SponsorError("Sponsored transactions are busy. Try again in a few minutes.", "sponsor_busy", 503);
    const spentWei = spent.reduce((sum, row) => sum + BigInt(row.costWei || 0), 0n);
    if (spentWei + worst > limits.dailyBudgetWei) throw new SponsorError("Today's gas sponsorship budget is used up. Try again tomorrow.", "sponsor_budget", 503);
    if (balance < limits.minBalanceWei + worst) throw new SponsorError("Gas sponsorship is temporarily unavailable (sponsor balance is low).", "sponsor_low_balance", 503);
    // In-flight transactions count at their worst-case cost until the real cost is known.
    return await SponsoredTx.create({ userUid, kind, to, account, bounty, costWei: worst.toString() });
  } finally {
    release();
  }
}

/** Public health only: never reveals the sponsor address, balance or spend. */
async function status({ detailed = false } = {}) {
  const { config, provider, sponsor } = chain();
  if (!sponsor) return { configured: false };
  const now = Date.now();
  const [balance, spent, hourCount] = await Promise.all([
    provider.getBalance(await sponsor.getAddress()),
    SponsoredTx.find({ createdAt: { $gt: new Date(now - 24 * HOUR) } }).select("costWei").lean(),
    SponsoredTx.countDocuments({ createdAt: { $gt: new Date(now - HOUR) } }),
  ]);
  const spentWei = spent.reduce((sum, row) => sum + BigInt(row.costWei || 0), 0n);
  const view = {
    configured: true,
    healthy: balance >= config.sponsor.minBalanceWei && spentWei < config.sponsor.dailyBudgetWei,
    limits: {
      userTxPerHour: config.sponsor.userTxPerHour, userTxPerDay: config.sponsor.userTxPerDay,
      globalTxPerHour: config.sponsor.globalTxPerHour, maxGasPerTx: config.sponsor.maxGasPerTx,
    },
  };
  if (!detailed) return view;
  return {
    ...view, address: await sponsor.getAddress(), balanceWei: balance.toString(), spentTodayWei: spentWei.toString(),
    dailyBudgetWei: config.sponsor.dailyBudgetWei.toString(), txLastHour: hourCount,
  };
}

/**
 * Simulates, then sends and confirms one sponsored transaction. Throws with a readable reason when the
 * call would revert, so no gas is spent on failing actions.
 */
async function sendSponsored({ userUid = "", kind, to, data, account = "", bounty, isAccount = false }) {
  const { config, provider, sponsor, autopayer } = chain();
  assertAllowedSponsorTx({ to, data }, { escrow: config.escrow, factory: config.accountFactory, isAccount, autopay: autopayer?.address });
  const record = await reserve({ userUid, kind, to, account, bounty });
  const from = await sponsor.getAddress();
  const cap = BigInt(config.sponsor.maxGasPerTx);
  let gas;
  try {
    gas = await provider.estimateGas({ from, to, data });
  } catch (error) {
    await SponsoredTx.deleteOne({ _id: record._id }); // a rejected simulation spent nothing and uses no quota
    const { message } = describeRevert(error);
    throw new SponsorError(message, "simulation_failed", 409);
  }
  if (gas > cap) {
    await SponsoredTx.deleteOne({ _id: record._id });
    throw new SponsorError("This transaction needs more gas than the sponsor allows.", "sponsor_gas_cap", 409);
  }
  const gasLimit = gas * 13n / 10n > cap ? cap : gas * 13n / 10n; // headroom, but never above the cap

  let tx;
  const previous = sendLock;
  let release;
  sendLock = new Promise((resolve) => { release = resolve; });
  try {
    await previous;
    tx = await sponsor.sendTransaction({ to, data, gasLimit });
  } catch (error) {
    sponsor.reset();
    await SponsoredTx.updateOne({ _id: record._id }, { status: "failed", error: String(error.shortMessage || error.message).slice(0, 400) });
    throw new SponsorError("The sponsored transaction could not be sent. Try again.", "send_failed");
  } finally {
    release();
  }
  await SponsoredTx.updateOne({ _id: record._id }, { txHash: tx.hash });
  let receipt;
  try {
    receipt = await tx.wait(1, 180000);
  } catch (error) {
    receipt = error.receipt || null;
    if (!receipt) {
      await SponsoredTx.updateOne({ _id: record._id }, { error: "Confirmation timed out." });
      throw new SponsorError("The transaction was sent but is not confirmed yet. It will sync automatically.", "pending", 202);
    }
  }
  const cost = (receipt.gasUsed || 0n) * (receipt.gasPrice || receipt.effectiveGasPrice || 0n);
  await SponsoredTx.updateOne({ _id: record._id }, {
    status: receipt.status === 1 ? "confirmed" : "reverted", gasUsed: String(receipt.gasUsed), costWei: String(cost),
  });
  if (receipt.status !== 1) throw new SponsorError("The transaction reverted on chain.", "reverted", 409);
  return receipt;
}

module.exports = { sendSponsored, reserve, status, SponsorError };
