const { getAddress, Interface } = require("ethers");
const Bounty = require("../../models/Bounty");
const Review = require("../../models/Review");
const User = require("../../models/User");
const { chain, requirePayments, ChainError, explorerTx, explorerAddress } = require("../chain/client");
const { ESCROW_ABI, ERC20_ABI, BOUNTY_STATUS } = require("../chain/abi");
const enc = require("../chain/encoding");
const { signAttestation, escrowDigest } = require("../chain/eip712");
const { createExecuteIntent, createSignIntent, onIntent, passkeyOf } = require("../chain/wallet");
const { sendSponsored } = require("../chain/sponsor");
const { processReceipt, reconcile } = require("../chain/indexer");
const { fetchPullRequestHead, fetchIssue, listOpenIssues } = require("../github");
const { isProjectMaintainer } = require("../projectAccess");
const { normalizeTexts, criteriaError } = require("../criteria");
const { reportView } = require("../chatSerializer");
const { postWorkflowNotice, emitBounty, plainText } = require("./notify");

const escrowIface = new Interface(ESCROW_ABI);
const erc20Iface = new Interface(ERC20_ABI);
const HOUR = 3600;
const lower = (value) => (value ? String(value).toLowerCase() : "");

class BountyError extends Error {
  constructor(message, status = 400, code = "bounty_error") { super(message); this.status = status; this.code = code; }
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const call = (target, iface, fn, args) => ({ target, value: 0n, data: iface.encodeFunctionData(fn, args) });
const selfAuth = (signer, deadline) => ({ signer, nonce: enc.randomNonce(), deadline, signature: "0x" });

function requireMaintainer(project, uid) {
  if (project.status !== "active" || !isProjectMaintainer(project, uid)) {
    throw new BountyError("Only the project owner or a co-owner can do this.", 403, "forbidden");
  }
}

async function loadUser(uid) {
  const user = await User.findOne({ firebaseUid: uid });
  if (!user) throw new BountyError("Your account was not found. Reload and sign in again.", 401);
  return user;
}

async function findBounty(project, number) {
  if (!/^\d{1,9}$/.test(String(number))) throw new BountyError("Invalid bounty number.", 400, "bad_number");
  const bounty = await Bounty.findOne({ project: project._id, number: Number(number) });
  if (!bounty) throw new BountyError("Bounty not found.", 404, "not_found");
  return bounty;
}

// ---------- Drafts ----------

function validateDraft(input, { partial = false } = {}) {
  const out = {};
  if (!partial || input.title !== undefined) {
    if (typeof input.title !== "string") throw new BountyError("Give the bounty a title.");
    out.title = input.title.replace(/\s+/g, " ").trim();
    if (!out.title) throw new BountyError("Give the bounty a title.");
    if (out.title.length > 200) throw new BountyError("Keep the title under 200 characters.");
  }
  if (input.description !== undefined) {
    if (input.description !== null && typeof input.description !== "string") throw new BountyError("The description must be text.");
    out.description = String(input.description || "");
    if (out.description.length > 4000) throw new BountyError("Keep the description under 4000 characters.");
  }
  if (!partial || input.amount !== undefined) {
    if (typeof input.amount !== "string" && typeof input.amount !== "number") throw new BountyError("Enter the reward in USDT.");
    try { out.amount = enc.parseUsdt(input.amount).toString(); } catch (error) { throw new BountyError(error.message); }
    if (BigInt(out.amount) > chain().config.sponsor.maxBountyUnits) throw new BountyError("That reward is above this server's limit.");
  }
  if (!partial || input.submissionDeadline !== undefined) {
    if (typeof input.submissionDeadline !== "string" && typeof input.submissionDeadline !== "number") throw new BountyError("Choose a submission deadline.");
    const deadline = new Date(input.submissionDeadline);
    if (Number.isNaN(deadline.getTime())) throw new BountyError("Choose a submission deadline.");
    if (deadline.getTime() < Date.now() + 24 * HOUR * 1000) throw new BountyError("The submission deadline must be at least a day away.");
    if (deadline.getTime() > Date.now() + 365 * 24 * HOUR * 1000) throw new BountyError("Choose a deadline within a year.");
    out.submissionDeadline = deadline;
  }
  if (!partial || input.criteria !== undefined) {
    if (!Array.isArray(input.criteria) || input.criteria.some((item) => typeof item !== "string")) {
      throw new BountyError("Criteria must be a list of text items.");
    }
    const texts = normalizeTexts(input.criteria);
    const error = criteriaError(texts);
    if (error) throw new BountyError(error);
    out.criteria = { items: texts.map((text, index) => ({ id: `c${index + 1}`, text })), hash: enc.criteriaHashFor(texts) };
  }
  if (input.issueNumber !== undefined) {
    const issue = input.issueNumber === null || input.issueNumber === "" ? null : Number(input.issueNumber);
    if (issue !== null && (!Number.isSafeInteger(issue) || issue < 1)) throw new BountyError("Enter a valid issue number.");
    out.issueNumber = issue;
  }
  return out;
}

// ---------- Issue links ----------

const OPEN_STATUSES = ["draft", "funding", "funded", "claimed", "submitted"];

/** One open bounty per issue: a paid or refunded bounty frees the issue again. */
async function assertIssueFree(project, issueNumber, exceptId) {
  if (!issueNumber) return;
  const filter = { project: project._id, "issue.number": issueNumber, status: { $in: OPEN_STATUSES } };
  if (exceptId) filter._id = { $ne: exceptId };
  const existing = await Bounty.findOne(filter).select("number status");
  if (existing) {
    throw new BountyError(`Issue #${issueNumber} already has an open bounty (#${existing.number}, ${existing.status}). Finish or delete it first.`, 409, "issue_taken");
  }
}

/** Open GitHub issues of the project's repository, each marked with the open bounty that already covers it. */
async function listIssues(project) {
  const fullName = project.githubRepository?.fullName;
  if (!fullName) return [];
  const [issues, taken] = await Promise.all([
    listOpenIssues(fullName),
    Bounty.find({ project: project._id, "issue.number": { $ne: null }, status: { $in: OPEN_STATUSES } }).select("number issue.number"),
  ]);
  const byIssue = new Map(taken.map((bounty) => [bounty.issue.number, bounty.number]));
  return issues.map((issue) => ({ ...issue, bountyNumber: byIssue.get(issue.number) || null }));
}

async function createDraft({ project, uid, name, input }) {
  requireMaintainer(project, uid);
  const fields = validateDraft(input);
  let issue = null;
  if (fields.issueNumber && project.githubRepository?.fullName) {
    const found = await fetchIssue(project.githubRepository.fullName, fields.issueNumber).catch(() => null);
    if (!found || found.kind !== "issue") throw new BountyError(`Issue #${fields.issueNumber} was not found in ${project.githubRepository.fullName}.`);
    issue = { number: found.number, title: found.title, url: found.url };
  }
  await assertIssueFree(project, issue?.number);
  const user = await loadUser(uid);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await Bounty.findOne({ project: project._id }).sort({ number: -1 }).select("number");
    const number = (last?.number || 0) + 1;
    const bounty = new Bounty({
      project: project._id, number, title: fields.title, description: fields.description || "",
      issue, criteria: fields.criteria, amount: fields.amount, token: chain().config.token,
      submissionDeadline: fields.submissionDeadline,
      createdBy: { uid, name: name || user.displayName, githubLogin: user.github?.username || "", account: user.wallet?.address || "" },
      chain: { bountyId: "pending" },
    });
    bounty.chain.bountyId = lower(enc.bountyIdFor(bounty._id));
    bounty.chain.repoRef = enc.repoRefFor(project.githubRepository?.fullName || project.slug, issue?.number || 0);
    try {
      await bounty.save();
      return bounty;
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
  }
  throw new BountyError("Could not number the bounty. Try again.", 409);
}

async function updateDraft({ project, uid, number, input }) {
  requireMaintainer(project, uid);
  const bounty = await findBounty(project, number);
  if (bounty.status !== "draft") throw new BountyError("Funded terms are locked and cannot be edited.", 409, "locked");
  const fields = validateDraft(input, { partial: true });
  const set = {};
  for (const key of ["title", "description", "amount", "submissionDeadline", "criteria"]) if (key in fields) set[key] = fields[key];
  if ("issueNumber" in fields) {
    let issue = null;
    if (fields.issueNumber) {
      const found = await fetchIssue(project.githubRepository.fullName, fields.issueNumber).catch(() => null);
      if (!found || found.kind !== "issue") throw new BountyError(`Issue #${fields.issueNumber} was not found.`);
      issue = { number: found.number, title: found.title, url: found.url };
    }
    await assertIssueFree(project, issue?.number, bounty._id);
    set.issue = issue;
    set["chain.repoRef"] = enc.repoRefFor(project.githubRepository?.fullName || project.slug, issue?.number || 0);
  }
  const updated = await Bounty.findOneAndUpdate({ _id: bounty._id, status: "draft" }, { $set: set }, { returnDocument: "after" });
  if (!updated) throw new BountyError("Funded terms are locked and cannot be edited.", 409, "locked");
  return updated;
}

async function deleteDraft({ project, uid, number }) {
  requireMaintainer(project, uid);
  const result = await Bounty.deleteOne({ project: project._id, number: Number(number), status: "draft" });
  if (!result.deletedCount) throw new BountyError("Only unfunded drafts can be deleted.", 409, "locked");
}

// ---------- Funding ----------

function termsOf(bounty) {
  return {
    bountyId: bounty.chain.bountyId, token: bounty.token, amount: BigInt(bounty.amount), criteriaHash: bounty.criteria.hash,
    repoRef: bounty.chain.repoRef, submissionDeadline: Math.floor(bounty.submissionDeadline.getTime() / 1000),
  };
}

async function prepareFund({ project, uid, number }) {
  const { config, escrow, token } = requirePayments();
  requireMaintainer(project, uid);
  const user = await loadUser(uid);
  const wallet = passkeyOf(user);
  const existing = await findBounty(project, number);
  if (!["draft", "funding"].includes(existing.status)) throw new BountyError("This bounty is already funded.", 409);
  // Lock the terms first (atomically), then build everything from the locked document, so an edit can never
  // slip in between reading the terms and signing them.
  const bounty = await Bounty.findOneAndUpdate(
    { _id: existing._id, status: { $in: ["draft", "funding"] }, "chain.termsMismatch": { $ne: true } },
    { $set: { status: "funding" } }, { returnDocument: "after" });
  if (!bounty) throw new BountyError("This bounty can no longer be funded. Its on-chain terms may differ from the draft; contact the project owner.", 409);
  try {
    if (bounty.submissionDeadline.getTime() < Date.now() + 2 * HOUR * 1000) throw new BountyError("Move the submission deadline later before funding.");
    if (lower(bounty.token) !== lower(config.token)) throw new BountyError("The reward token is not the configured USDT.");
    const [isMaintainer, balance] = await Promise.all([escrow.hasMaintainerRole(wallet.address), token.balanceOf(wallet.address)]);
    if (!isMaintainer) throw new BountyError("Your payment account is not an escrow maintainer yet. The project owner grants it under Payment permissions.", 409, "not_maintainer");
    if (balance < BigInt(bounty.amount)) {
      throw new BountyError(`Your payment account holds ${enc.formatUsdt(balance)} USDT; this bounty needs ${enc.formatUsdt(bounty.amount)}. Send test USDT to ${getAddress(wallet.address)}.`, 409, "insufficient_balance");
    }
    const terms = termsOf(bounty);
    return await createExecuteIntent({
      user, kind: "fund", project: project._id, bounty: bounty._id,
      calls: [call(config.token, erc20Iface, "approve", [config.escrow, terms.amount]), call(config.escrow, escrowIface, "fund", [terms])],
      summary: `Lock ${enc.formatUsdt(bounty.amount)} USDT in escrow for bounty #${bounty.number}. Network fees are sponsored.`,
    });
  } catch (error) {
    // Nothing was signed: reopen the draft for editing (a pending earlier intent keeps it locked).
    if (existing.status === "draft") await Bounty.updateOne({ _id: bounty._id, status: "funding" }, { $set: { status: "draft" } });
    throw error;
  }
}

// ---------- Claims ----------

async function requestClaim({ project, uid, number, message }) {
  if (isProjectMaintainer(project, uid)) throw new BountyError("Project maintainers cannot claim bounties they manage.", 403, "maintainer_claim");
  const user = await loadUser(uid);
  const wallet = passkeyOf(user);
  const bounty = await findBounty(project, number);
  if (bounty.status !== "funded") throw new BountyError("Only funded, unclaimed bounties accept claim requests.", 409);
  if (!user.github?.username || !user.github.id) throw new BountyError("Verify your GitHub account first (sign in with GitHub) so your PR can be matched to you.", 409);
  if (lower(bounty.chain.funder) === lower(wallet.address) || bounty.createdBy?.uid === uid) {
    throw new BountyError("You funded this bounty, so you cannot claim its reward.", 409, "self_payment");
  }
  if (bounty.submissionDeadline < new Date()) throw new BountyError("The submission deadline has passed.", 409);
  const entry = { uid, githubId: user.github.id, name: user.displayName || user.github.username, githubLogin: user.github.username, account: wallet.address,
    message: String(message || "").slice(0, 1000), status: "pending", at: new Date() };
  const updated = await Bounty.findOneAndUpdate(
    { _id: bounty._id, status: "funded", claimRequests: { $not: { $elemMatch: { uid, status: "pending" } } } },
    { $push: { claimRequests: entry } }, { returnDocument: "after" });
  if (!updated) throw new BountyError("You already have a pending request for this bounty.", 409);
  await postWorkflowNotice(project._id, `**Claim request:** ${plainText(entry.name)} (@${plainText(entry.githubLogin, 39)}) asked to work on bounty #${bounty.number} "${plainText(bounty.title)}". A maintainer can accept it from the bounty board.`);
  emitBounty(project._id, bounty.number);
  return updated;
}

async function withdrawClaim({ project, uid, number }) {
  const bounty = await findBounty(project, number);
  await Bounty.updateOne({ _id: bounty._id }, { $set: { "claimRequests.$[r].status": "withdrawn" } },
    { arrayFilters: [{ "r.uid": uid, "r.status": "pending" }] });
  emitBounty(project._id, bounty.number);
}

async function declineClaim({ project, uid, number, requestId }) {
  requireMaintainer(project, uid);
  const bounty = await findBounty(project, number);
  await Bounty.updateOne({ _id: bounty._id }, { $set: { "claimRequests.$[r].status": "declined" } },
    { arrayFilters: [{ "r._id": requestId, "r.status": "pending" }] });
  emitBounty(project._id, bounty.number);
}

async function prepareAccept({ project, uid, number, requestId }) {
  const { config, escrow } = requirePayments();
  requireMaintainer(project, uid);
  const user = await loadUser(uid);
  const wallet = passkeyOf(user);
  const bounty = await findBounty(project, number);
  const state = await reconcile(bounty);
  if (state.status !== "funded" || state.mismatch || bounty.chain.termsMismatch) throw new BountyError("The bounty must be funded and unclaimed to accept a claim.", 409);
  const request = bounty.claimRequests.id(requestId);
  if (!request || request.status !== "pending") throw new BountyError("That claim request is no longer pending.", 409);
  const claimant = await User.findOne({ firebaseUid: request.uid });
  if (!claimant?.wallet?.address || lower(claimant.wallet.address) !== lower(request.account) || claimant.wallet.kind !== "passkey") {
    throw new BountyError("The contributor's verified payment account changed. Ask them to request again.", 409);
  }
  if ([lower(wallet.address), lower(bounty.chain.funder)].includes(lower(request.account))) {
    throw new BountyError("The funder or approver cannot be the recipient.", 409, "self_payment");
  }
  if (!(await escrow.hasMaintainerRole(wallet.address))) throw new BountyError("Your payment account is not an escrow maintainer.", 409, "not_maintainer");
  return createExecuteIntent({
    user, kind: "accept_claim", project: project._id, bounty: bounty._id,
    calls: [call(config.escrow, escrowIface, "acceptClaim", [bounty.chain.bountyId, getAddress(request.account), selfAuth(wallet.address, nowSeconds() + HOUR)])],
    summary: `Accept ${request.name} as the only claimant of bounty #${bounty.number}; the reward is bound to their account.`,
    meta: { requestId: String(request._id) },
  });
}

// ---------- Submission (backend attestation, sponsored) ----------

async function submitPullRequest({ project, uid, number, prNumber, io, queueReview }) {
  const { config, escrow, attester } = requirePayments();
  const bounty = await findBounty(project, number);
  if (bounty.claimant?.uid !== uid) throw new BountyError("Only the accepted claimant can submit work for this bounty.", 403);
  const state = await reconcile(bounty);
  if (state.status !== "claimed") throw new BountyError(state.status === "funded" ? "Your claim expired before a submission was registered." : "This bounty is not waiting for a submission.", 409);
  const n = Number(prNumber);
  if (!Number.isSafeInteger(n) || n < 1) throw new BountyError("Enter your pull request number.");
  const repo = project.githubRepository.fullName;
  // Revalidate GitHub immediately before attesting.
  const pr = await fetchPullRequestHead(repo, n).catch(() => null);
  if (!pr) throw new BountyError(`PR #${n} was not found in ${repo}.`, 404);
  if (lower(pr.baseRepo) !== lower(repo)) throw new BountyError("The PR must target this project's repository.");
  const sameAuthor = bounty.claimant.githubId
    ? String(pr.authorId) === String(bounty.claimant.githubId)
    : lower(pr.author) === lower(bounty.claimant.githubLogin);
  if (!sameAuthor) throw new BountyError(`PR #${n} was opened by @${plainText(pr.author, 39)}, not by the claimant @${plainText(bounty.claimant.githubLogin, 39)}.`, 403);
  if (pr.state === "closed") throw new BountyError("That PR is closed without being merged.", 409);
  if (pr.draft) throw new BountyError("Mark the PR ready for review before submitting it. Draft PRs cannot be registered.", 409, "draft_pr");
  if (await Bounty.exists({ project: project._id, _id: { $ne: bounty._id }, "submission.prNumber": n })) {
    throw new BountyError(`PR #${n} is already registered for another bounty. One PR can back only one bounty.`, 409, "pr_in_use");
  }
  if (!/^[0-9a-f]{40}$/i.test(pr.headSha || "")) throw new BountyError("Could not read the PR head commit.", 502);

  const onchain = state.onchain;
  const submissionRef = enc.submissionRefFor(repo, n, pr.headSha);
  const attestation = await signAttestation({
    signer: attester, chainId: config.chainId, escrow: config.escrow, type: "SubmissionAttestation",
    value: { bountyId: bounty.chain.bountyId, claimVersion: Number(onchain.claimVersion), recipient: onchain.recipient, submissionRef },
  });
  // The unique PR index makes this write the atomic claim on the PR number (a race loses with a conflict).
  try {
    await Bounty.updateOne({ _id: bounty._id, status: "claimed" }, { $set: { submission: { prNumber: n, prUrl: pr.url, headSha: pr.headSha, ref: submissionRef, requestedAt: new Date() } } });
  } catch (error) {
    if (error.code === 11000) throw new BountyError(`PR #${n} is already registered for another bounty.`, 409, "pr_in_use");
    throw error;
  }
  let receipt;
  try {
    receipt = await sendSponsored({
      userUid: uid, kind: "register_submission", to: config.escrow, bounty: bounty._id,
      data: escrowIface.encodeFunctionData("registerSubmission", [bounty.chain.bountyId, Number(onchain.claimVersion), submissionRef, attestation]),
    });
  } catch (error) {
    // A pending confirmation may still land; only a failure that left the bounty unsubmitted releases the PR.
    if (error.code !== "pending") {
      const after = await reconcile(await Bounty.findById(bounty._id)).catch(() => null);
      if (after?.status !== "submitted") await Bounty.updateOne({ _id: bounty._id, status: { $ne: "submitted" } }, { $unset: { submission: 1 } });
    }
    throw error;
  }
  await processReceipt(receipt);
  // Review the PR against this bounty's funded criteria (0G).
  queueReview?.({ io, project, prNumber: n, uid });
  return { txHash: receipt.hash, explorer: explorerTx(receipt.hash) };
}

// ---------- Settlement ----------

async function currentEvidence(project, bounty) {
  const prNumber = bounty.submission?.prNumber;
  if (!prNumber) throw new BountyError("No pull request is registered for this bounty.", 409);
  const review = await Review.findOne({ project: project._id, bounty: bounty._id, prNumber, status: "complete" }).sort({ createdAt: -1, _id: -1 });
  return { prNumber, review };
}

/**
 * Re-checks every fact the settlement binds: on-chain agreement, PR author/merge/head, and a current 0G report
 * for this bounty's criteria. Returns the settlement struct or throws with the reason.
 */
async function settlementFacts(project, bounty) {
  const { escrow } = requirePayments();
  const state = await reconcile(bounty);
  if (state.status !== "submitted") throw new BountyError("Only a bounty with a registered submission can be paid.", 409);
  const onchain = state.onchain;
  if (lower(onchain.criteriaHash) !== lower(bounty.criteria.hash) || BigInt(onchain.amount) !== BigInt(bounty.amount)) {
    throw new BountyError("The escrow agreement does not match the stored terms. Payment is blocked.", 409, "terms_mismatch");
  }
  const { prNumber, review } = await currentEvidence(project, bounty);
  // The PR we will pay for must be the one the backend attested on chain at submission time.
  const expectedRef = enc.submissionRefFor(project.githubRepository.fullName, prNumber, bounty.submission.headSha);
  if (lower(onchain.submissionRef) !== lower(expectedRef)) {
    throw new BountyError("The pull request on file does not match the submission registered on chain. Payment is blocked.", 409, "submission_mismatch");
  }
  if (!review || !review.requestId || !review.reportHash) throw new BountyError("A current 0G evidence report is required before payout. Run a review of the PR.", 409, "no_review");
  if (review.criteriaHash !== bounty.criteria.hash) throw new BountyError("The latest report was made against other criteria. Run a fresh review.", 409, "stale_review");
  const pr = await fetchPullRequestHead(project.githubRepository.fullName, prNumber);
  const stillClaimant = bounty.claimant.githubId ? String(pr.authorId) === String(bounty.claimant.githubId) : lower(pr.author) === lower(bounty.claimant.githubLogin);
  if (!stillClaimant) throw new BountyError("The PR author no longer matches the claimant.", 409);
  if (pr.state !== "merged" || !/^[0-9a-f]{40}$/i.test(pr.mergeCommitSha || "")) throw new BountyError("Merge the PR on GitHub before approving the payout.", 409, "not_merged");
  if (pr.headSha !== review.headSha) {
    await Review.updateOne({ _id: review._id }, { $set: { status: "stale" } });
    throw new BountyError("The PR changed after the last review. Run a fresh review of the merged commit.", 409, "stale_review");
  }
  return {
    review, pr,
    settlement: {
      bountyId: bounty.chain.bountyId, claimVersion: Number(onchain.claimVersion), recipient: onchain.recipient,
      amount: BigInt(onchain.amount), criteriaHash: onchain.criteriaHash, reviewedSha: enc.shaToBytes32(review.headSha),
      mergeRef: enc.shaToBytes32(pr.mergeCommitSha), reportHash: enc.reportHashToBytes32(review.reportHash),
    },
    escrow,
  };
}

async function preparePayout({ project, uid, number, acknowledgeWarnings, reportHash }) {
  const { config, escrow, attester } = requirePayments();
  requireMaintainer(project, uid);
  const user = await loadUser(uid);
  const wallet = passkeyOf(user);
  const bounty = await findBounty(project, number);
  if (!(await escrow.canAuthorizePayout(wallet.address))) {
    throw new BountyError("Your payment account cannot approve payouts. The owner grants the settlement permission.", 409, "not_payout_authority");
  }
  if (lower(wallet.address) === lower(bounty.chain.recipient)) throw new BountyError("You cannot approve a payout to yourself.", 409, "self_payment");
  const { review, pr, settlement } = await settlementFacts(project, bounty);
  // An acknowledgement only covers the exact report the maintainer was looking at.
  if (acknowledgeWarnings && reportHash !== review.reportHash) {
    throw new BountyError("The 0G report changed while you were reviewing it. Reload and check it again before approving.", 409, "report_changed");
  }
  if (review.verdict !== "ready_for_approval" && !acknowledgeWarnings) {
    throw new BountyError(`The 0G report says "${review.verdict.replaceAll("_", " ")}". Confirm you reviewed the evidence to approve anyway.`, 409, "needs_acknowledgement");
  }
  const attestation = await signAttestation({ signer: attester, chainId: config.chainId, escrow: config.escrow, type: "SettlementAttestation", value: settlement });
  await Bounty.updateOne({ _id: bounty._id }, { $set: { payout: {
    reviewId: review._id, reviewedSha: review.headSha, mergeSha: pr.mergeCommitSha, reportHash: review.reportHash, approvedByUid: uid,
  } } });
  return createExecuteIntent({
    user, kind: "settle", project: project._id, bounty: bounty._id,
    calls: [call(config.escrow, escrowIface, "settle", [settlement, attestation, selfAuth(wallet.address, nowSeconds() + HOUR)])],
    summary: `Pay ${enc.formatUsdt(bounty.amount)} USDT to ${bounty.claimant.name || "the claimant"} for merged PR #${bounty.submission.prNumber} (0G request ${review.requestId}).`,
    meta: { reviewId: String(review._id) },
  });
}

// ---------- Refunds and cancellation ----------

async function prepareRefund({ project, uid, number }) {
  const { config, escrow } = requirePayments();
  const user = await loadUser(uid);
  const wallet = passkeyOf(user);
  const bounty = await findBounty(project, number);
  const isFunder = lower(bounty.chain.funder) === lower(wallet.address);
  if (!isFunder) requireMaintainer(project, uid);
  const state = await reconcile(bounty);
  if (state.status !== "funded") {
    throw new BountyError(state.status === "submitted"
      ? "Submitted work can only be settled or cancelled by mutual agreement."
      : "Only a funded bounty without an active claim can be refunded.", 409);
  }
  if (!isFunder && !(await escrow.hasMaintainerRole(wallet.address))) throw new BountyError("Your payment account is not an escrow maintainer.", 409);
  return createExecuteIntent({
    user, kind: "refund", project: project._id, bounty: bounty._id,
    calls: [call(config.escrow, escrowIface, "refund", [bounty.chain.bountyId, selfAuth(wallet.address, nowSeconds() + HOUR)])],
    summary: `Return ${enc.formatUsdt(bounty.amount)} USDT from bounty #${bounty.number} to the original funder.`,
  });
}

async function prepareCancelConsent({ project, uid, number }) {
  const { config } = requirePayments();
  const user = await loadUser(uid);
  const wallet = passkeyOf(user);
  const bounty = await findBounty(project, number);
  const state = await reconcile(bounty);
  if (!["claimed", "submitted"].includes(state.status) || lower(state.onchain?.recipient) !== lower(wallet.address)) {
    throw new BountyError("Only the current claimant can agree to cancel this bounty.", 403);
  }
  const value = { bountyId: bounty.chain.bountyId, claimVersion: Number(state.onchain.claimVersion), nonce: enc.randomNonce(), deadline: nowSeconds() + 23 * HOUR };
  const digest = escrowDigest({ chainId: config.chainId, escrow: config.escrow, type: "CancelByAgreement", value });
  return createSignIntent({
    user, kind: "cancel_consent", digest, project: project._id, bounty: bounty._id, deadline: value.deadline,
    summary: `Agree to cancel bounty #${bounty.number}. The reward returns to the funder and you give up this claim.`,
    meta: { nonce: value.nonce, deadline: value.deadline, claimVersion: value.claimVersion },
  });
}

onIntent("cancel_consent", async ({ intent, signature }) => {
  await Bounty.updateOne({ _id: intent.bounty }, { $set: { cancelConsent: {
    signer: intent.account, nonce: intent.meta.nonce, deadline: intent.meta.deadline, claimVersion: intent.meta.claimVersion,
    signature, at: new Date(),
  } } });
  const bounty = await Bounty.findById(intent.bounty);
  if (bounty) {
    await postWorkflowNotice(bounty.project, `**Cancellation consent:** the claimant of bounty #${bounty.number} agreed to cancel. A maintainer can now return the reward to the funder.`);
    emitBounty(bounty.project, bounty.number);
  }
});

async function prepareCancel({ project, uid, number }) {
  const { config, escrow } = requirePayments();
  requireMaintainer(project, uid);
  const user = await loadUser(uid);
  const wallet = passkeyOf(user);
  const bounty = await findBounty(project, number);
  const state = await reconcile(bounty);
  const consent = bounty.cancelConsent;
  if (!["claimed", "submitted"].includes(state.status)) throw new BountyError("Only claimed or submitted bounties need mutual cancellation.", 409);
  if (!consent?.signature || consent.claimVersion !== Number(state.onchain.claimVersion) || consent.deadline < nowSeconds() + 300
    || lower(consent.signer) !== lower(state.onchain.recipient)) {
    throw new BountyError("The claimant has not agreed to cancel (or their consent expired).", 409, "no_consent");
  }
  if (!(await escrow.hasMaintainerRole(wallet.address)) && lower(wallet.address) !== lower(state.onchain.funder)) {
    throw new BountyError("Your payment account is not an escrow maintainer.", 409);
  }
  const claimantAuth = { signer: getAddress(consent.signer), nonce: consent.nonce, deadline: consent.deadline, signature: consent.signature };
  return createExecuteIntent({
    user, kind: "cancel", project: project._id, bounty: bounty._id,
    calls: [call(config.escrow, escrowIface, "cancelByAgreement", [bounty.chain.bountyId, consent.claimVersion, selfAuth(wallet.address, nowSeconds() + HOUR), claimantAuth])],
    summary: `Cancel bounty #${bounty.number} by agreement and return ${enc.formatUsdt(bounty.amount)} USDT to the funder.`,
  });
}

async function expireClaim({ project, number, uid }) {
  const { config } = requirePayments();
  const bounty = await findBounty(project, number);
  if (bounty.status !== "claimed" || !bounty.chain.claimExpiry || bounty.chain.claimExpiry > new Date()) {
    throw new BountyError("This claim has not expired.", 409);
  }
  const receipt = await sendSponsored({ userUid: uid, kind: "expire_claim", to: config.escrow, bounty: bounty._id,
    data: escrowIface.encodeFunctionData("expireClaim", [bounty.chain.bountyId]) });
  await processReceipt(receipt);
  return { txHash: receipt.hash };
}

// ---------- Views ----------

const LIMITATION = "Submitted work can only be released by a maintainer-approved payout or cancelled when both sides agree. There is no arbitration: unresolved submissions stay locked in escrow.";

async function bountyView(bounty, { project, uid, viewerAccount, includeReview = false }) {
  const maintainer = isProjectMaintainer(project, uid);
  const mine = bounty.claimRequests.find((r) => r.uid === uid && r.status === "pending");
  const claimant = bounty.claimant?.uid === uid;
  const status = bounty.status;
  const view = {
    id: bounty.id, number: bounty.number, title: bounty.title, description: bounty.description, issue: bounty.issue || null,
    criteria: bounty.criteria.items.map((c) => ({ id: c.id, text: c.text })), criteriaHash: bounty.criteria.hash,
    amount: bounty.amount, amountDisplay: enc.formatUsdt(bounty.amount), token: bounty.token, tokenSymbol: "USDT",
    submissionDeadline: bounty.submissionDeadline, status, createdBy: { name: bounty.createdBy?.name || "" },
    claimant: bounty.claimant?.account ? { name: bounty.claimant.name, githubLogin: bounty.claimant.githubLogin, account: bounty.claimant.account } : null,
    claimExpiry: bounty.chain.claimExpiry || null,
    submission: bounty.submission?.prNumber ? {
      prNumber: bounty.submission.prNumber, prUrl: bounty.submission.prUrl, headSha: bounty.submission.headSha,
      registered: Boolean(bounty.submission.txHash), error: bounty.submission.error || "",
    } : null,
    claimRequests: maintainer ? bounty.claimRequests.filter((r) => r.status === "pending").map((r) => ({
      id: String(r._id), name: r.name, githubLogin: r.githubLogin, account: r.account, message: r.message, at: r.at,
    })) : [],
    myClaimRequest: mine ? { at: mine.at } : null,
    cancelConsent: bounty.cancelConsent?.signature ? { at: bounty.cancelConsent.at, deadline: bounty.cancelConsent.deadline } : null,
    receipts: [
      ["Funded", bounty.chain.fundTx], ["Claim accepted", bounty.chain.acceptTx], ["Submission registered", bounty.chain.submissionTx],
      ["Paid", bounty.chain.payoutTx], ["Refunded", bounty.chain.refundTx],
    ].filter(([, hash]) => hash).map(([label, hash]) => ({ label, hash, url: explorerTx(hash) })),
    escrow: { bountyId: bounty.chain.bountyId, funder: bounty.chain.funder || "", recipient: bounty.chain.recipient || "",
      claimVersion: bounty.chain.claimVersion, refundReason: bounty.chain.refundReason || "", syncedAt: bounty.chain.syncedAt || null,
      funderUrl: explorerAddress(bounty.chain.funder) },
    limitation: LIMITATION,
    autoPay: {
      enabled: Boolean(bounty.autoPay?.enabled), state: bounty.autoPay?.state || "", reason: bounty.autoPay?.reason || "",
      by: bounty.autoPay?.enabled ? bounty.autoPay.byName || "" : "", available: chain().config.autopayEnabled,
    },
    viewer: {
      maintainer, claimant,
      canEdit: maintainer && status === "draft",
      canFund: maintainer && ["draft", "funding"].includes(status),
      canRequestClaim: !maintainer && status === "funded" && !mine && Boolean(viewerAccount) && lower(viewerAccount) !== lower(bounty.chain.funder),
      canSubmit: claimant && status === "claimed",
      canApprovePayout: maintainer && status === "submitted",
      canToggleAutoPay: maintainer && ["funded", "claimed", "submitted"].includes(status) && chain().config.autopayEnabled,
      canRefund: (maintainer || (viewerAccount && lower(viewerAccount) === lower(bounty.chain.funder))) && status === "funded",
      canConsentCancel: claimant && ["claimed", "submitted"].includes(status) && !bounty.cancelConsent?.signature,
      canCancel: maintainer && ["claimed", "submitted"].includes(status) && Boolean(bounty.cancelConsent?.signature),
      canExpire: status === "claimed" && bounty.chain.claimExpiry && bounty.chain.claimExpiry < new Date(),
    },
  };
  if (includeReview && bounty.submission?.prNumber) {
    const review = await Review.findOne({ project: project._id, bounty: bounty._id, prNumber: bounty.submission.prNumber }).sort({ createdAt: -1, _id: -1 });
    view.review = review ? reportView(review, { hash: bounty.criteria.hash, version: 1 }) : null;
  }
  return view;
}

module.exports = {
  BountyError, createDraft, updateDraft, deleteDraft, prepareFund, requestClaim, withdrawClaim, declineClaim, prepareAccept,
  submitPullRequest, preparePayout, prepareRefund, prepareCancelConsent, prepareCancel, expireClaim, bountyView, findBounty,
  settlementFacts, listIssues, BOUNTY_STATUS, LIMITATION,
};
