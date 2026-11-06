const { Interface } = require("ethers");
const Bounty = require("../../models/Bounty");
const Project = require("../../models/Project");
const { requirePayments, explorerTx } = require("../chain/client");
const { ESCROW_ABI } = require("../chain/abi");
const enc = require("../chain/encoding");
const { signAttestation, signPayoutApproval } = require("../chain/eip712");
const { sendSponsored } = require("../chain/sponsor");
const { processReceipt } = require("../chain/indexer");
const { isProjectMaintainer } = require("../projectAccess");
const { postWorkflowNotice, emitBounty, plainText } = require("./notify");
const { BountyError, findBounty, settlementFacts } = require("./service");

// Automatic payout. A maintainer opts a funded bounty in; once its PR is merged on GitHub and the current 0G
// report recommends approval, OpenBounty releases the reward by itself. The escrow still demands two separate
// signatures (the backend attestation and the payout agent's approval), only pays the recipient bound at claim
// acceptance, and only up to the cap the escrow owner registered for the agent. Anything unusual (a report that
// asks for a person, a changed commit, a failed transaction) stops automation and leaves the manual payout.
const escrowIface = new Interface(ESCROW_ABI);
const MAX_ATTEMPTS = 5;
const STALE_PROCESSING_MS = 10 * 60 * 1000;

// Reasons that only mean "not yet": the PR is not merged, or there is no current report for it.
const WAITING = new Set(["not_merged", "no_review", "stale_review", "not_submitted"]);

const setState = async (bounty, autoPay, notice) => {
  await Bounty.updateOne({ _id: bounty._id }, { $set: Object.fromEntries(Object.entries(autoPay).map(([k, v]) => [`autoPay.${k}`, v])) });
  emitBounty(bounty.project, bounty.number);
  if (notice) await postWorkflowNotice(bounty.project, notice);
};

/** Maintainer opt-in or opt-out for one bounty. */
async function setAutoPay({ project, uid, name, number, enabled }) {
  if (project.status !== "active" || !isProjectMaintainer(project, uid)) {
    throw new BountyError("Only the project owner or a co-owner can do this.", 403, "forbidden");
  }
  const bounty = await findBounty(project, number);
  if (!enabled) {
    await Bounty.updateOne({ _id: bounty._id }, { $set: { "autoPay.enabled": false, "autoPay.state": "", "autoPay.reason": "" } });
    emitBounty(project._id, bounty.number);
    return findBounty(project, number);
  }
  const { config, escrow, autopayer } = requirePayments();
  if (!config.autopayEnabled || !autopayer) throw new BountyError("Automatic payout is not configured on this server.", 409, "autopay_unavailable");
  if (!["funded", "claimed", "submitted"].includes(bounty.status)) {
    throw new BountyError("Turn on automatic payout once the bounty is funded and before it is paid.", 409, "autopay_state");
  }
  if (!(await escrow.canAutoPay(autopayer.address, BigInt(bounty.amount)))) {
    throw new BountyError("The escrow owner has not registered the payout agent for this amount. Ask them to enable automatic payouts in Payments.", 409, "autopay_not_registered");
  }
  await Bounty.updateOne({ _id: bounty._id }, { $set: {
    autoPay: { enabled: true, byUid: uid, byName: String(name || "Maintainer").slice(0, 120), at: new Date(), state: "waiting", reason: "Waiting for the PR to be merged and reviewed.", attempts: 0 },
  } });
  emitBounty(project._id, bounty.number);
  void tryAutoPayout({ projectId: project._id, bountyId: bounty._id });
  return findBounty(project, number);
}

/** One attempt. Safe to call repeatedly: an atomic claim keeps two attempts from running at once. */
async function tryAutoPayout({ projectId, bountyId }) {
  const found = await Bounty.findById(bountyId);
  if (!found?.autoPay?.enabled || found.status !== "submitted") return { status: "skipped" };
  if (found.autoPay.state === "failed" && found.autoPay.attempts >= MAX_ATTEMPTS) return { status: "skipped" };

  const bounty = await Bounty.findOneAndUpdate({
    _id: bountyId, "autoPay.enabled": true, status: "submitted",
    $or: [{ "autoPay.state": { $ne: "processing" } }, { "autoPay.lastAttemptAt": { $lt: new Date(Date.now() - STALE_PROCESSING_MS) } }],
  }, { $set: { "autoPay.state": "processing", "autoPay.lastAttemptAt": new Date() } }, { returnDocument: "after" });
  if (!bounty) return { status: "busy" };

  // A repeated "blocked" outcome (for example after each new report) is announced once, not every time.
  const stop = (kind, reason, notice) => {
    const same = found.autoPay.state === kind && found.autoPay.reason === String(reason).slice(0, 300);
    return setState(bounty, { state: kind, reason: String(reason).slice(0, 300) }, same ? "" : notice)
      .then(() => ({ status: kind, reason }));
  };
  try {
    const project = await Project.findById(projectId).populate("owner", "firebaseUid").populate("coOwners", "firebaseUid");
    if (project?.status !== "active") return await stop("blocked", "The project is not active.");
    const { config, escrow, attester, autopayer } = requirePayments();
    if (!config.autopayEnabled || !autopayer) return await stop("blocked", "Automatic payout is not configured on this server.");
    if (!isProjectMaintainer(project, bounty.autoPay.byUid)) {
      return await stop("blocked", "The maintainer who enabled automatic payout no longer has access.",
        `Automatic payout for bounty #${bounty.number} is paused: the maintainer who enabled it no longer has access. A maintainer can approve the payout manually.`);
    }
    if (!(await escrow.canAutoPay(autopayer.address, BigInt(bounty.amount)))) {
      return await stop("blocked", "The payout agent is no longer registered on the escrow for this amount.",
        `Automatic payout for bounty #${bounty.number} is paused: the escrow owner has not registered the payout agent for this amount. A maintainer can approve the payout manually.`);
    }

    let facts;
    try {
      facts = await settlementFacts(project, bounty);
    } catch (error) {
      if (error instanceof BountyError && WAITING.has(error.code)) return await stop("waiting", error.message);
      if (error instanceof BountyError) {
        return await stop("blocked", error.message, `Automatic payout for bounty #${bounty.number} is paused: ${plainText(error.message, 200)} A maintainer can approve the payout manually.`);
      }
      throw error;
    }
    const { review, pr, settlement } = facts;
    // Only an unqualified recommendation pays by itself. Anything else needs a person to read the evidence.
    if (review.verdict !== "ready_for_approval") {
      return await stop("blocked", `The 0G report says "${review.verdict.replaceAll("_", " ")}".`,
        `Automatic payout for bounty #${bounty.number} is paused: the 0G report says "${plainText(review.verdict.replaceAll("_", " "), 40)}". A maintainer must read the evidence and approve the payout.`);
    }

    const attestation = await signAttestation({ signer: attester, chainId: config.chainId, escrow: config.escrow, type: "SettlementAttestation", value: settlement });
    const approval = await signPayoutApproval({ signer: autopayer, chainId: config.chainId, escrow: config.escrow, value: settlement });
    await Bounty.updateOne({ _id: bounty._id }, { $set: { payout: {
      reviewId: review._id, reviewedSha: review.headSha, mergeSha: pr.mergeCommitSha, reportHash: review.reportHash, approvedByUid: `autopay:${bounty.autoPay.byUid}`,
    } } });

    let receipt;
    try {
      receipt = await sendSponsored({
        kind: "auto_payout", to: config.escrow, bounty: bounty._id,
        data: escrowIface.encodeFunctionData("settle", [settlement, attestation, approval]),
      });
    } catch (error) {
      // A transaction that was sent but not yet confirmed is finished by the indexer; never send it twice.
      if (error.code === "pending") return await stop("processing", "The payout was sent and is waiting for confirmation.");
      throw error;
    }
    await processReceipt(receipt);
    await setState(bounty, { state: "paid", reason: "", txHash: receipt.hash },
      `Paid ${enc.formatUsdt(bounty.amount)} USDT to ${plainText(bounty.claimant?.name || "the claimant")} for merged PR #${bounty.submission.prNumber} (0G request ${plainText(review.requestId, 80)}). Automatic payout enabled by ${plainText(bounty.autoPay.byName)}. Receipt: ${explorerTx(receipt.hash)}`);
    return { status: "paid", txHash: receipt.hash };
  } catch (error) {
    console.error(`Automatic payout for bounty #${bounty.number} failed:`, error.code || "", error.message);
    const reason = error.message || "The payout could not be sent.";
    const attempts = (bounty.autoPay.attempts || 0) + 1;
    await Bounty.updateOne({ _id: bounty._id }, { $set: { "autoPay.attempts": attempts } });
    const exhausted = attempts >= MAX_ATTEMPTS;
    return stop("failed", reason, exhausted
      ? `Automatic payout for bounty #${bounty.number} failed ${MAX_ATTEMPTS} times (${plainText(reason, 160)}). A maintainer can approve the payout manually.`
      : "");
  }
}

/** Called when a review for a bounty's PR finishes (including after merge). Never throws. */
function onReviewComplete({ project, review }) {
  if (!review?.bounty) return;
  void tryAutoPayout({ projectId: project._id, bountyId: review.bounty })
    .catch((error) => console.error("Automatic payout check failed:", error.message));
}

/** Safety net for a missed webhook: look at opted-in submissions every few minutes. */
async function sweep() {
  const open = await Bounty.find({ "autoPay.enabled": true, status: "submitted", "autoPay.state": { $in: ["waiting", "processing", "failed"] } }).limit(50);
  for (const bounty of open) await tryAutoPayout({ projectId: bounty.project, bountyId: bounty._id }).catch(() => {});
}

let timer = null;
function start(intervalMs = 120000) {
  if (timer) return;
  timer = setInterval(() => { sweep().catch((error) => console.error("Automatic payout sweep failed:", error.message)); }, intervalMs);
  timer.unref?.();
}

module.exports = { setAutoPay, tryAutoPayout, onReviewComplete, sweep, start, MAX_ATTEMPTS };
