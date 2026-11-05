const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { usdt, id, REVIEWED_SHA, MERGE_REF, REPORT_HASH, mkAuth, mkAttestation } = require("./helpers");

const Status = { Draft: 0, Funded: 1, Claimed: 2, Submitted: 3, Paid: 4, Refunded: 5 };
const Reason = { NoActiveClaim: 0, DeadlinePassed: 1, MutualCancellation: 2 };
const HOUR = 3600;
const DAY = 24 * HOUR;
const REENTRANCY_SELECTOR = ethers.id("ReentrancyGuardReentrantCall()").slice(0, 10);

async function deploy() {
  const [deployer, repoOwner, backend, maint, maint2, contrib, contrib2, outsider, relayer, controller] =
    await ethers.getSigners();
  const token = await (await ethers.getContractFactory("MockUSDT")).deploy();
  const tokenAddr = await token.getAddress();
  const escrow = await (await ethers.getContractFactory("BountyEscrow")).deploy(
    repoOwner.address,
    backend.address,
    [tokenAddr]
  );
  const escrowAddr = await escrow.getAddress();

  await escrow.connect(repoOwner).setMaintainer(maint.address, true);
  await escrow.connect(repoOwner).setSettlementWallet(maint.address, true);
  // maint2 is a maintainer WITHOUT the settlement-wallet flag: can fund/accept but not authorize payouts.
  await escrow.connect(repoOwner).setMaintainer(maint2.address, true);

  for (const s of [maint, maint2, repoOwner]) {
    await token.mint(s.address, usdt(1_000_000));
    await token.connect(s).approve(escrowAddr, ethers.MaxUint256);
  }
  return {
    deployer, repoOwner, backend, maint, maint2, contrib, contrib2, outsider, relayer, controller,
    token, tokenAddr, escrow, escrowAddr,
  };
}

let seq = 0;
async function newTerms(ctx, overrides = {}) {
  seq++;
  return {
    bountyId: id("bounty-" + seq),
    token: ctx.tokenAddr,
    amount: usdt(500),
    criteriaHash: id("criteria-v1"),
    repoRef: id("repo#1"),
    submissionDeadline: (await time.latest()) + 7 * DAY,
    ...overrides,
  };
}

async function fund(ctx, overrides = {}, funder = ctx.maint) {
  const t = await newTerms(ctx, overrides);
  await ctx.escrow.connect(funder).fund(t);
  return t;
}

async function accept(ctx, t, recipient = ctx.contrib, { signer = ctx.maint, caller = ctx.relayer, opts } = {}) {
  const b = await ctx.escrow.getBounty(t.bountyId);
  const addr = recipient.address ?? recipient;
  const auth = await mkAuth(
    ctx.escrow, signer, "AcceptClaim",
    { bountyId: t.bountyId, recipient: addr, claimVersion: Number(b.claimVersion) + 1 },
    opts
  );
  return ctx.escrow.connect(caller).acceptClaim(t.bountyId, addr, auth);
}

async function submit(ctx, t, { ref = id("pr-42"), backend = ctx.backend, ttl } = {}) {
  const b = await ctx.escrow.getBounty(t.bountyId);
  const att = await mkAttestation(
    ctx.escrow, backend, "SubmissionAttestation",
    { bountyId: t.bountyId, claimVersion: b.claimVersion, recipient: b.recipient, submissionRef: ref },
    { ttl }
  );
  return ctx.escrow.connect(ctx.relayer).registerSubmission(t.bountyId, b.claimVersion, ref, att);
}

async function toClaimed(ctx, overrides = {}, recipient = ctx.contrib) {
  const t = await fund(ctx, overrides);
  await accept(ctx, t, recipient);
  return t;
}

async function toSubmitted(ctx, overrides = {}, recipient = ctx.contrib) {
  const t = await toClaimed(ctx, overrides, recipient);
  await submit(ctx, t);
  return t;
}

async function settlementFor(ctx, t, overrides = {}) {
  const b = await ctx.escrow.getBounty(t.bountyId);
  return {
    bountyId: t.bountyId,
    claimVersion: b.claimVersion,
    recipient: b.recipient,
    amount: b.amount,
    criteriaHash: b.criteriaHash,
    reviewedSha: REVIEWED_SHA,
    mergeRef: MERGE_REF,
    reportHash: REPORT_HASH,
    ...overrides,
  };
}

/** Sign a settlement: backend attestation + human approval over the same facts unless overridden. */
async function signSettlement(ctx, s, o = {}) {
  const att = await mkAttestation(
    ctx.escrow, o.backend ?? ctx.backend, "SettlementAttestation", o.attFields ?? s, o.attOpts
  );
  const approval = await mkAuth(
    ctx.escrow, o.approver ?? ctx.maint, "PayoutApproval", o.approvalFields ?? s, o.approvalOpts
  );
  return { att, approval };
}

async function settle(ctx, t, o = {}) {
  const s = await settlementFor(ctx, t, o.overrides);
  const { att, approval } = await signSettlement(ctx, s, o);
  return ctx.escrow.connect(o.caller ?? ctx.relayer).settle(s, att, approval);
}

async function refund(ctx, t, { signer = ctx.maint, caller = ctx.relayer, opts } = {}) {
  const auth = await mkAuth(ctx.escrow, signer, "Refund", { bountyId: t.bountyId }, opts);
  return ctx.escrow.connect(caller).refund(t.bountyId, auth);
}

async function cancel(ctx, t, o = {}) {
  const b = await ctx.escrow.getBounty(t.bountyId);
  const version = o.version ?? b.claimVersion;
  const f = { bountyId: t.bountyId, claimVersion: version };
  const funderSide = await mkAuth(ctx.escrow, o.funderSide ?? ctx.maint, "CancelByAgreement", f, o.funderOpts);
  const claimant = await mkAuth(ctx.escrow, o.claimant ?? ctx.contrib, "CancelByAgreement", f, o.claimantOpts);
  return ctx.escrow.connect(o.caller ?? ctx.relayer).cancelByAgreement(t.bountyId, version, funderSide, claimant);
}

const blockTime = async (tx) => (await ethers.provider.getBlock((await tx.wait()).blockNumber)).timestamp;

module.exports = { Status, Reason, HOUR, DAY, REENTRANCY_SELECTOR, deploy, newTerms, fund, accept, submit, toClaimed, toSubmitted, settlementFor, signSettlement, settle, refund, cancel, blockTime };
