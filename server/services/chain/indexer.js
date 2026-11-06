const { getAddress } = require("ethers");
const Bounty = require("../../models/Bounty");
const { ChainEvent, ChainCursor } = require("../../models/ChainEvent");
const { chain, explorerTx } = require("./client");
const { BOUNTY_STATUS, REFUND_REASONS } = require("./abi");
const { formatUsdt } = require("./encoding");
const { postWorkflowNotice, emitBounty } = require("../bounties/notify");

// Mirrors escrow events into MongoDB. Every log is applied once (unique txHash+logIndex), bounty updates are
// ordered by (block, logIndex), and `reconcile` re-reads the contract to repair anything a missed log left behind.
const CURSOR = "escrow";
let timer = null;
let polling = false;
let polls = 0;

const lower = (value) => (value ? String(value).toLowerCase() : "");
const serialize = (args, fragment) => Object.fromEntries(fragment.inputs.map((input, index) => {
  const value = args[index];
  return [input.name, typeof value === "bigint" ? value.toString() : value];
}));

function newerThan(log) {
  return { $or: [
    { "chain.lastBlock": { $lt: log.blockNumber } },
    { "chain.lastBlock": log.blockNumber, "chain.lastLogIndex": { $lt: log.index ?? log.logIndex } },
  ] };
}

async function applyToBounty(name, args, log) {
  const bountyId = lower(args.bountyId);
  const position = { "chain.lastBlock": log.blockNumber, "chain.lastLogIndex": log.index ?? log.logIndex, "chain.syncedAt": new Date() };
  const filter = { "chain.bountyId": bountyId, ...newerThan(log) };
  const tx = log.transactionHash;
  let set = null;
  let notice = null;
  const bounty = await Bounty.findOne({ "chain.bountyId": bountyId });
  if (!bounty) return;
  const label = `bounty #${bounty.number} "${bounty.title}"`;

  if (name === "BountyFunded") {
    const matches = BigInt(args.amount) === BigInt(bounty.amount) && lower(args.criteriaHash) === lower(bounty.criteria.hash)
      && lower(args.token) === lower(bounty.token);
    if (!matches) console.warn(`Escrow terms for ${bountyId} differ from the stored draft.`);
    set = { status: "funded", "chain.funder": lower(args.funder), "chain.termsHash": args.termsHash, "chain.fundTx": tx };
    notice = `**Funded:** ${label} now holds ${formatUsdt(args.amount)} USDT in escrow. Contributors can request a claim. [Receipt](${explorerTx(tx)})`;
  } else if (name === "ClaimAccepted") {
    const recipient = lower(args.recipient);
    const request = bounty.claimRequests.find((item) => lower(item.account) === recipient && item.status === "pending");
    set = {
      status: "claimed", "chain.claimVersion": Number(args.claimVersion), "chain.recipient": recipient,
      "chain.claimExpiry": new Date(Number(args.claimExpiry) * 1000), "chain.acceptTx": tx,
      claimant: request ? { uid: request.uid, name: request.name, githubLogin: request.githubLogin, account: recipient } : { account: recipient },
      submission: {}, cancelConsent: {},
    };
    if (request) {
      await Bounty.updateOne({ _id: bounty._id }, { $set: { "claimRequests.$[r].status": "accepted" } },
        { arrayFilters: [{ "r._id": request._id }] });
    }
    notice = `**Claim accepted:** ${request?.name || "A contributor"} holds ${label} until ${new Date(Number(args.claimExpiry) * 1000).toUTCString()}. Submit a PR before then to protect the claim. [Receipt](${explorerTx(tx)})`;
  } else if (name === "ClaimExpired") {
    set = { status: "funded", "chain.recipient": "", "chain.claimExpiry": null, claimant: {}, submission: {}, cancelConsent: {} };
    notice = `**Claim expired:** ${label} is open again. The reward stays in escrow.`;
  } else if (name === "SubmissionRegistered") {
    set = { status: "submitted", "chain.submissionRef": args.submissionRef, "chain.submissionTx": tx, "submission.txHash": tx };
    notice = `**Submission registered:** PR #${bounty.submission?.prNumber || "?"} is protected for ${label}. Settlement now needs a maintainer approval after merge. [Receipt](${explorerTx(tx)})`;
  } else if (name === "PayoutSettled") {
    set = { status: "paid", "chain.payoutTx": tx, "chain.payoutApprovedBy": lower(args.approvedBy), "chain.payoutAttestedBy": lower(args.attestedBy) };
    notice = `**Paid:** ${formatUsdt(args.amount)} USDT went to ${bounty.claimant?.name || "the contributor"} for ${label}. Network fees were sponsored by OpenBounty. [Payment receipt](${explorerTx(tx)})`;
  } else if (name === "BountyRefunded") {
    const reason = REFUND_REASONS[Number(args.reason)] || "refund";
    set = { status: "refunded", "chain.refundTx": tx, "chain.refundReason": reason };
    notice = `**Refunded:** ${formatUsdt(args.amount)} USDT returned to the funder of ${label} (${reason.replaceAll("_", " ")}). [Receipt](${explorerTx(tx)})`;
  }
  if (!set) return;
  const result = await Bounty.updateOne(filter, { $set: { ...set, ...position } });
  if (result.modifiedCount) {
    emitBounty(bounty.project, bounty.number);
    if (notice) await postWorkflowNotice(bounty.project, notice);
  }
}

/** Applies one escrow log. Returns false if it was already applied. */
async function applyLog(log) {
  const { escrow } = chain();
  let parsed;
  try { parsed = escrow.interface.parseLog(log); } catch { return false; }
  if (!parsed) return false;
  const args = serialize(parsed.args, parsed.fragment);
  try {
    await ChainEvent.create({
      txHash: log.transactionHash, logIndex: log.index ?? log.logIndex, blockNumber: log.blockNumber,
      name: parsed.name, bountyId: lower(args.bountyId), args,
    });
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
  if (args.bountyId) await applyToBounty(parsed.name, args, log);
  return true;
}

/** Applies the escrow logs of a receipt fetched by the backend itself (never one supplied by a client). */
async function processReceipt(receipt) {
  const { config } = chain();
  for (const log of receipt?.logs || []) {
    if (lower(log.address) === lower(config.escrow)) await applyLog(log);
  }
}

async function poll() {
  const { config, provider } = chain();
  if (!config.escrow || polling) return;
  polling = true;
  try {
    const cursor = await ChainCursor.findOneAndUpdate({ name: CURSOR }, { $setOnInsert: { block: Math.max(config.indexerStartBlock - 1, 0) } },
      { upsert: true, returnDocument: "after" });
    // Raw call: ethers caches getBlockNumber, which can hide the newest block from this poll.
    const latest = Number(await provider.send("eth_blockNumber", []));
    let from = cursor.block + 1;
    while (from <= latest) {
      const to = Math.min(from + config.indexerBatchBlocks - 1, latest);
      const logs = await provider.getLogs({ address: config.escrow, fromBlock: from, toBlock: to });
      for (const log of logs) await applyLog(log);
      await ChainCursor.updateOne({ name: CURSOR }, { $set: { block: to } });
      from = to + 1;
    }
    polls += 1;
    if (polls % 8 === 1) await reconcileActive();
  } catch (error) {
    console.error("Escrow indexer poll failed:", error.shortMessage || error.message);
  } finally {
    polling = false;
  }
}

const ACTIVE = ["funding", "funded", "claimed", "submitted"];

/** Re-reads one bounty from the contract and repairs chain-derived fields (missed or reordered events). */
async function reconcile(bounty) {
  const { escrow } = chain();
  const [onchain, effective] = await Promise.all([escrow.getBounty(bounty.chain.bountyId), escrow.effectiveStatus(bounty.chain.bountyId)]);
  const stored = BOUNTY_STATUS[Number(onchain.status)];
  const status = BOUNTY_STATUS[Number(effective)];
  if (stored === "draft") {
    // Nothing on chain: a "funding" draft whose signature never landed goes back to draft after its intent expires.
    if (bounty.status === "funding" && bounty.updatedAt < new Date(Date.now() - 15 * 60 * 1000)) {
      await Bounty.updateOne({ _id: bounty._id, status: "funding" }, { $set: { status: "draft" } });
      emitBounty(bounty.project, bounty.number);
    }
    return { status: bounty.status === "funding" ? "funding" : bounty.status, onchain: null };
  }
  const set = {
    status, "chain.funder": lower(onchain.funder), "chain.claimVersion": Number(onchain.claimVersion),
    "chain.termsHash": onchain.termsHash, "chain.syncedAt": new Date(),
  };
  if (status === "claimed" || status === "submitted") {
    set["chain.recipient"] = lower(onchain.recipient);
    set["chain.claimExpiry"] = Number(onchain.claimExpiry) ? new Date(Number(onchain.claimExpiry) * 1000) : null;
  }
  if (status === "funded" && bounty.status === "claimed") Object.assign(set, { claimant: {}, submission: {}, "chain.recipient": "" });
  if (status !== bounty.status) {
    await Bounty.updateOne({ _id: bounty._id }, { $set: set });
    emitBounty(bounty.project, bounty.number);
  } else {
    await Bounty.updateOne({ _id: bounty._id }, { $set: { "chain.syncedAt": new Date() } });
  }
  return { status, onchain };
}

async function reconcileActive() {
  const active = await Bounty.find({ status: { $in: ACTIVE } }).limit(100);
  for (const bounty of active) {
    try { await reconcile(bounty); } catch (error) { console.error("Reconcile failed:", error.shortMessage || error.message); }
  }
}

function start() {
  const { config } = chain();
  if (!config.escrow || timer) return;
  timer = setInterval(poll, config.indexerPollMs);
  timer.unref?.();
  poll();
}

module.exports = { start, poll, applyLog, processReceipt, reconcile, reconcileActive, getAddress };
