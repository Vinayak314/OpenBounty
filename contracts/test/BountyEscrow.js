const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
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

describe("BountyEscrow", function () {
  describe("deployment", function () {
    it("sets owner, attestation signer and token allowlist, with EIP-712 domain bound to chain and contract", async function () {
      const ctx = await loadFixture(deploy);
      expect(await ctx.escrow.owner()).to.equal(ctx.repoOwner.address);
      expect(await ctx.escrow.attestationSigner()).to.equal(ctx.backend.address);
      expect(await ctx.escrow.isTokenAllowed(ctx.tokenAddr)).to.equal(true);
      const d = await ctx.escrow.eip712Domain();
      expect(d.name).to.equal("OpenBountyEscrow");
      expect(d.version).to.equal("1");
      expect(d.chainId).to.equal((await ethers.provider.getNetwork()).chainId);
      expect(d.verifyingContract).to.equal(ctx.escrowAddr);
    });

    it("rejects a zero attestation signer", async function () {
      const ctx = await loadFixture(deploy);
      const F = await ethers.getContractFactory("BountyEscrow");
      await expect(F.deploy(ctx.repoOwner.address, ethers.ZeroAddress, [ctx.tokenAddr])).to.be.revertedWithCustomError(
        ctx.escrow, "ZeroAddress"
      );
    });

    it("exposes no function that withdraws, sweeps or edits funded terms", async function () {
      const ctx = await loadFixture(deploy);
      const names = ctx.escrow.interface.fragments.filter((f) => f.type === "function").map((f) => f.name);
      for (const n of names) {
        expect(n).to.not.match(/withdraw|sweep|rescue|recover|drain|setTerms|updateBounty|setRecipient|setAmount/i);
      }
      // Every function that can move tokens out is one of these three (plus the funding pulls in).
      expect(names).to.include.members(["settle", "refund", "cancelByAgreement"]);
    });
  });

  describe("roles and permissions", function () {
    it("only the owner can grant or revoke maintainers and settlement wallets", async function () {
      const ctx = await loadFixture(deploy);
      await expect(ctx.escrow.connect(ctx.repoOwner).setMaintainer(ctx.contrib.address, true))
        .to.emit(ctx.escrow, "MaintainerUpdated").withArgs(ctx.contrib.address, true);
      expect(await ctx.escrow.hasMaintainerRole(ctx.contrib.address)).to.equal(true);
      await expect(ctx.escrow.connect(ctx.repoOwner).setMaintainer(ctx.contrib.address, false))
        .to.emit(ctx.escrow, "MaintainerUpdated").withArgs(ctx.contrib.address, false);
      expect(await ctx.escrow.hasMaintainerRole(ctx.contrib.address)).to.equal(false);
      await expect(ctx.escrow.connect(ctx.repoOwner).setSettlementWallet(ctx.maint2.address, true))
        .to.emit(ctx.escrow, "SettlementWalletUpdated").withArgs(ctx.maint2.address, true);
      expect(await ctx.escrow.canAuthorizePayout(ctx.maint2.address)).to.equal(true);
    });

    it("maintainers and contributors cannot manage roles, the signer, or the token allowlist", async function () {
      const ctx = await loadFixture(deploy);
      for (const who of [ctx.maint, ctx.contrib, ctx.backend, ctx.outsider]) {
        const e = ctx.escrow.connect(who);
        await expect(e.setMaintainer(who.address, true)).to.be.revertedWithCustomError(ctx.escrow, "OwnableUnauthorizedAccount");
        await expect(e.setSettlementWallet(who.address, true)).to.be.revertedWithCustomError(ctx.escrow, "OwnableUnauthorizedAccount");
        await expect(e.setAttestationSigner(who.address)).to.be.revertedWithCustomError(ctx.escrow, "OwnableUnauthorizedAccount");
        await expect(e.setTokenAllowed(who.address, true)).to.be.revertedWithCustomError(ctx.escrow, "OwnableUnauthorizedAccount");
      }
    });

    it("ownership transfer is two-step and renouncing is disabled", async function () {
      const ctx = await loadFixture(deploy);
      await ctx.escrow.connect(ctx.repoOwner).transferOwnership(ctx.maint2.address);
      expect(await ctx.escrow.owner()).to.equal(ctx.repoOwner.address);
      await ctx.escrow.connect(ctx.maint2).acceptOwnership();
      expect(await ctx.escrow.owner()).to.equal(ctx.maint2.address);
      await expect(ctx.escrow.connect(ctx.maint2).renounceOwnership()).to.be.revertedWithCustomError(ctx.escrow, "Unsupported");
    });

    it("contributors cannot fund, accept claims, refund or authorize payouts", async function () {
      const ctx = await loadFixture(deploy);
      const terms = await newTerms(ctx);
      await ctx.token.mint(ctx.contrib.address, usdt(1000));
      await ctx.token.connect(ctx.contrib).approve(ctx.escrowAddr, ethers.MaxUint256);
      await expect(ctx.escrow.connect(ctx.contrib).fund(terms))
        .to.be.revertedWithCustomError(ctx.escrow, "NotMaintainer").withArgs(ctx.contrib.address);

      const t = await fund(ctx);
      await expect(accept(ctx, t, ctx.contrib2, { signer: ctx.contrib }))
        .to.be.revertedWithCustomError(ctx.escrow, "NotMaintainer").withArgs(ctx.contrib.address);
      await expect(refund(ctx, t, { signer: ctx.contrib }))
        .to.be.revertedWithCustomError(ctx.escrow, "NotRefundAuthority").withArgs(ctx.contrib.address);

      const sub = await toSubmitted(ctx);
      await expect(settle(ctx, sub, { approver: ctx.contrib2 }))
        .to.be.revertedWithCustomError(ctx.escrow, "NotPayoutAuthority").withArgs(ctx.contrib2.address);
    });

    it("a revoked maintainer's still-valid signature no longer works (roles checked at execution time)", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      const b = await ctx.escrow.getBounty(t.bountyId);
      const auth = await mkAuth(ctx.escrow, ctx.maint2, "AcceptClaim", {
        bountyId: t.bountyId, recipient: ctx.contrib.address, claimVersion: Number(b.claimVersion) + 1,
      });
      await ctx.escrow.connect(ctx.repoOwner).setMaintainer(ctx.maint2.address, false);
      await expect(ctx.escrow.connect(ctx.relayer).acceptClaim(t.bountyId, ctx.contrib.address, auth))
        .to.be.revertedWithCustomError(ctx.escrow, "NotMaintainer").withArgs(ctx.maint2.address);
    });

    it("payout authority needs both the maintainer role and the settlement-wallet flag (owner is implicit)", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      // maint2 is a maintainer but has no settlement flag.
      await expect(settle(ctx, t, { approver: ctx.maint2 }))
        .to.be.revertedWithCustomError(ctx.escrow, "NotPayoutAuthority").withArgs(ctx.maint2.address);
      // The settlement flag alone, without the maintainer role, is not enough either.
      await ctx.escrow.connect(ctx.repoOwner).setSettlementWallet(ctx.outsider.address, true);
      await expect(settle(ctx, t, { approver: ctx.outsider }))
        .to.be.revertedWithCustomError(ctx.escrow, "NotPayoutAuthority").withArgs(ctx.outsider.address);
      // The repository owner may authorize payouts.
      await expect(settle(ctx, t, { approver: ctx.repoOwner })).to.emit(ctx.escrow, "PayoutSettled");
    });

    it("rotating the attestation signer invalidates the old key and does not touch funded terms", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      const before = await ctx.escrow.getBounty(t.bountyId);
      await expect(ctx.escrow.connect(ctx.repoOwner).setAttestationSigner(ctx.outsider.address))
        .to.emit(ctx.escrow, "AttestationSignerUpdated").withArgs(ctx.backend.address, ctx.outsider.address);
      await expect(settle(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
      const after = await ctx.escrow.getBounty(t.bountyId);
      expect(after.amount).to.equal(before.amount);
      expect(after.recipient).to.equal(before.recipient);
      expect(after.criteriaHash).to.equal(before.criteriaHash);
      await expect(settle(ctx, t, { backend: ctx.outsider })).to.emit(ctx.escrow, "PayoutSettled");
    });
  });

  describe("funding", function () {
    it("locks the funds and records immutable terms with a complete event", async function () {
      const ctx = await loadFixture(deploy);
      const t = await newTerms(ctx);
      const hash = await ctx.escrow.hashTerms(t, ctx.maint.address);
      const before = await ctx.token.balanceOf(ctx.maint.address);
      await expect(ctx.escrow.connect(ctx.maint).fund(t))
        .to.emit(ctx.escrow, "BountyFunded")
        .withArgs(t.bountyId, ctx.maint.address, ctx.tokenAddr, t.amount, t.criteriaHash, t.repoRef, t.submissionDeadline, hash);
      expect(await ctx.token.balanceOf(ctx.escrowAddr)).to.equal(t.amount);
      expect(await ctx.token.balanceOf(ctx.maint.address)).to.equal(before - t.amount);
      const b = await ctx.escrow.getBounty(t.bountyId);
      expect(b.status).to.equal(Status.Funded);
      expect(b.funder).to.equal(ctx.maint.address);
      expect(b.amount).to.equal(t.amount);
      expect(b.criteriaHash).to.equal(t.criteriaHash);
      expect(b.submissionDeadline).to.equal(t.submissionDeadline);
      expect(b.recipient).to.equal(ethers.ZeroAddress);
    });

    it("cannot overwrite funded terms by funding the same bounty id again", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      const altered = { ...t, amount: usdt(1), criteriaHash: id("criteria-evil") };
      await expect(ctx.escrow.connect(ctx.maint).fund(altered))
        .to.be.revertedWithCustomError(ctx.escrow, "BountyExists").withArgs(t.bountyId);
      await expect(ctx.escrow.connect(ctx.maint2).fund(t)).to.be.revertedWithCustomError(ctx.escrow, "BountyExists");
      const b = await ctx.escrow.getBounty(t.bountyId);
      expect(b.amount).to.equal(t.amount);
      expect(b.criteriaHash).to.equal(t.criteriaHash);
    });

    it("rejects tokens that are not allowlisted", async function () {
      const ctx = await loadFixture(deploy);
      const other = await (await ethers.getContractFactory("MockUSDT")).deploy();
      const t = await newTerms(ctx, { token: await other.getAddress() });
      await expect(ctx.escrow.connect(ctx.maint).fund(t))
        .to.be.revertedWithCustomError(ctx.escrow, "TokenNotAllowed").withArgs(await other.getAddress());
    });

    it("rejects invalid terms: zero id, zero amount, zero criteria hash, past deadline", async function () {
      const ctx = await loadFixture(deploy);
      const now = await time.latest();
      for (const bad of [
        { bountyId: ethers.ZeroHash },
        { amount: 0n },
        { criteriaHash: ethers.ZeroHash },
        { submissionDeadline: now },
        { submissionDeadline: now - 10 },
      ]) {
        await expect(ctx.escrow.connect(ctx.maint).fund(await newTerms(ctx, bad)))
          .to.be.revertedWithCustomError(ctx.escrow, "InvalidTerms");
      }
    });

    it("rejects fee-on-transfer tokens instead of under-collateralising the bounty", async function () {
      const ctx = await loadFixture(deploy);
      const fee = await (await ethers.getContractFactory("FeeOnTransferToken")).deploy();
      await ctx.escrow.connect(ctx.repoOwner).setTokenAllowed(await fee.getAddress(), true);
      await fee.mint(ctx.maint.address, usdt(1000));
      await fee.connect(ctx.maint).approve(ctx.escrowAddr, ethers.MaxUint256);
      const t = await newTerms(ctx, { token: await fee.getAddress() });
      await expect(ctx.escrow.connect(ctx.maint).fund(t))
        .to.be.revertedWithCustomError(ctx.escrow, "UnexpectedTransferAmount").withArgs(t.amount, t.amount - t.amount / 100n);
    });

    it("fails cleanly without token allowance", async function () {
      const ctx = await loadFixture(deploy);
      await ctx.escrow.connect(ctx.repoOwner).setMaintainer(ctx.outsider.address, true);
      await ctx.token.mint(ctx.outsider.address, usdt(1000));
      await expect(ctx.escrow.connect(ctx.outsider).fund(await newTerms(ctx)))
        .to.be.revertedWithCustomError(ctx.token, "ERC20InsufficientAllowance");
    });

    async function signReceive(ctx, funder, t, { validBefore, nonce, value } = {}) {
      validBefore = validBefore ?? (await time.latest()) + HOUR;
      nonce = nonce ?? (await ctx.escrow.hashTerms(t, funder.address));
      const sig = await funder.signTypedData(
        { name: "Tether USD", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: ctx.tokenAddr },
        {
          ReceiveWithAuthorization: [
            { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
          ],
        },
        { from: funder.address, to: ctx.escrowAddr, value: value ?? t.amount, validAfter: 0, validBefore, nonce }
      );
      const parsed = ethers.Signature.from(sig); // v/r/s are prototype getters, so they must be copied explicitly
      return { v: parsed.v, r: parsed.r, s: parsed.s, validBefore };
    }

    it("gasless funding: a zero-ETH maintainer funds via a signed EIP-3009 authorization relayed by someone else", async function () {
      const ctx = await loadFixture(deploy);
      const payer = ethers.Wallet.createRandom().connect(ethers.provider); // no native gas token at all
      await ctx.escrow.connect(ctx.repoOwner).setMaintainer(payer.address, true);
      await ctx.token.mint(payer.address, usdt(1000)); // note: payer never approved the escrow
      expect(await ethers.provider.getBalance(payer.address)).to.equal(0n);

      const t = await newTerms(ctx);
      const { v, r, s, validBefore } = await signReceive(ctx, payer, t);
      await expect(ctx.escrow.connect(ctx.relayer).fundWithAuthorization(t, payer.address, 0, validBefore, v, r, s))
        .to.emit(ctx.escrow, "BountyFunded").withArgs(t.bountyId, payer.address, ctx.tokenAddr, t.amount, t.criteriaHash, t.repoRef, t.submissionDeadline, anyValue);
      expect((await ctx.escrow.getBounty(t.bountyId)).funder).to.equal(payer.address);
      expect(await ctx.token.balanceOf(ctx.escrowAddr)).to.equal(t.amount);
      expect(await ethers.provider.getBalance(payer.address)).to.equal(0n);
    });

    it("gasless funding is bound to the exact terms: a relayer cannot swap amount, criteria, deadline or bounty id", async function () {
      const ctx = await loadFixture(deploy);
      const t = await newTerms(ctx);
      const { v, r, s, validBefore } = await signReceive(ctx, ctx.maint, t);
      for (const alt of [
        { ...t, criteriaHash: id("criteria-evil") },
        { ...t, submissionDeadline: t.submissionDeadline + 1 },
        { ...t, bountyId: id("someone-elses-bounty") },
        { ...t, repoRef: id("repo#2") },
        { ...t, amount: t.amount - 1n },
      ]) {
        await expect(ctx.escrow.connect(ctx.relayer).fundWithAuthorization(alt, ctx.maint.address, 0, validBefore, v, r, s))
          .to.be.revertedWith("MockUSDT: invalid signature");
      }
      // The untampered terms still work, once.
      await ctx.escrow.connect(ctx.relayer).fundWithAuthorization(t, ctx.maint.address, 0, validBefore, v, r, s);
      await expect(ctx.escrow.connect(ctx.relayer).fundWithAuthorization(t, ctx.maint.address, 0, validBefore, v, r, s))
        .to.be.revertedWithCustomError(ctx.escrow, "BountyExists");
    });

    it("gasless funding is rejected for a funder who is not a maintainer", async function () {
      const ctx = await loadFixture(deploy);
      await ctx.token.mint(ctx.contrib.address, usdt(1000));
      const t = await newTerms(ctx);
      const { v, r, s, validBefore } = await signReceive(ctx, ctx.contrib, t);
      await expect(ctx.escrow.connect(ctx.relayer).fundWithAuthorization(t, ctx.contrib.address, 0, validBefore, v, r, s))
        .to.be.revertedWithCustomError(ctx.escrow, "NotMaintainer").withArgs(ctx.contrib.address);
    });
  });

  describe("claims", function () {
    it("atomically accepts exactly one claimant and binds the recipient", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      const tx = await accept(ctx, t, ctx.contrib);
      const ts = await blockTime(tx);
      await expect(tx).to.emit(ctx.escrow, "ClaimAccepted")
        .withArgs(t.bountyId, 1, ctx.contrib.address, ctx.maint.address, ts + 72 * HOUR);
      const b = await ctx.escrow.getBounty(t.bountyId);
      expect(b.status).to.equal(Status.Claimed);
      expect(b.recipient).to.equal(ctx.contrib.address);
      expect(b.claimVersion).to.equal(1);
      // A competing active reservation is rejected.
      await expect(accept(ctx, t, ctx.contrib2)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Claimed);
    });

    it("disallows self-payment: funder or accepting maintainer as recipient", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx); // funded by maint
      await expect(accept(ctx, t, ctx.maint, { signer: ctx.maint2 })).to.be.revertedWithCustomError(ctx.escrow, "SelfPayment");
      await expect(accept(ctx, t, ctx.maint2, { signer: ctx.maint2 })).to.be.revertedWithCustomError(ctx.escrow, "SelfPayment");
      await expect(accept(ctx, t, ethers.ZeroAddress)).to.be.revertedWithCustomError(ctx.escrow, "InvalidRecipient");
      await expect(accept(ctx, t, ctx.escrowAddr)).to.be.revertedWithCustomError(ctx.escrow, "InvalidRecipient");
      await expect(accept(ctx, t, ctx.tokenAddr)).to.be.revertedWithCustomError(ctx.escrow, "InvalidRecipient");
    });

    it("cannot accept after the submission deadline, or an unfunded bounty", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      await time.increaseTo(t.submissionDeadline);
      await expect(accept(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "DeadlinePassed");
      const ghost = { bountyId: id("never-funded") };
      await expect(accept(ctx, ghost)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Draft);
    });

    it("an unsubmitted claim expires after 72h, is released without a refund, and the work can be re-claimed", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      const tx = await accept(ctx, t, ctx.contrib);
      const acceptedAt = await blockTime(tx);

      await expect(ctx.escrow.expireClaim(t.bountyId)).to.be.revertedWithCustomError(ctx.escrow, "ClaimNotExpired");
      await time.increaseTo(acceptedAt + 72 * HOUR - 10);
      expect(await ctx.escrow.effectiveStatus(t.bountyId)).to.equal(Status.Claimed);
      await time.increaseTo(acceptedAt + 72 * HOUR);
      expect(await ctx.escrow.effectiveStatus(t.bountyId)).to.equal(Status.Funded);

      await expect(ctx.escrow.connect(ctx.outsider).expireClaim(t.bountyId))
        .to.emit(ctx.escrow, "ClaimExpired").withArgs(t.bountyId, 1, ctx.contrib.address);
      const b = await ctx.escrow.getBounty(t.bountyId);
      expect(b.status).to.equal(Status.Funded);
      expect(b.recipient).to.equal(ethers.ZeroAddress);
      expect(await ctx.token.balanceOf(ctx.escrowAddr)).to.equal(t.amount); // still escrowed, not refunded

      await accept(ctx, t, ctx.contrib2);
      const b2 = await ctx.escrow.getBounty(t.bountyId);
      expect(b2.claimVersion).to.equal(2);
      expect(b2.recipient).to.equal(ctx.contrib2.address);
    });

    it("acceptance lazily releases an expired claim without a separate expireClaim call", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toClaimed(ctx);
      await time.increase(72 * HOUR + 1);
      await expect(accept(ctx, t, ctx.contrib2)).to.emit(ctx.escrow, "ClaimExpired").and.to.emit(ctx.escrow, "ClaimAccepted");
      expect((await ctx.escrow.getBounty(t.bountyId)).recipient).to.equal(ctx.contrib2.address);
    });

    it("a claim expires at the submission deadline when that comes before 72h", async function () {
      const ctx = await loadFixture(deploy);
      const deadline = (await time.latest()) + 10 * HOUR;
      const t = await fund(ctx, { submissionDeadline: deadline });
      await expect(accept(ctx, t)).to.emit(ctx.escrow, "ClaimAccepted").withArgs(t.bountyId, 1, ctx.contrib.address, ctx.maint.address, deadline);
      await time.increaseTo(deadline);
      expect(await ctx.escrow.effectiveStatus(t.bountyId)).to.equal(Status.Funded);
      // Reopening is pointless after the deadline: no new claim can be accepted.
      await expect(accept(ctx, t, ctx.contrib2)).to.be.revertedWithCustomError(ctx.escrow, "DeadlinePassed");
    });
  });

  describe("submission registration", function () {
    it("backend-attested registration moves Claimed to Submitted and is relayable by anyone", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toClaimed(ctx);
      await expect(submit(ctx, t, { ref: id("pr-7") }))
        .to.emit(ctx.escrow, "SubmissionRegistered").withArgs(t.bountyId, 1, ctx.contrib.address, id("pr-7"), anyValue);
      const b = await ctx.escrow.getBounty(t.bountyId);
      expect(b.status).to.equal(Status.Submitted);
      expect(b.submissionRef).to.equal(id("pr-7"));
    });

    it("rejects a submission not attested by the backend signer (claimants cannot self-register)", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toClaimed(ctx);
      await expect(submit(ctx, t, { backend: ctx.contrib })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
      await expect(submit(ctx, t, { backend: ctx.repoOwner })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
    });

    it("rejects registration after the claim expired, with a stale claim version, or on the wrong status", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toClaimed(ctx);
      const b = await ctx.escrow.getBounty(t.bountyId);
      const att = await mkAttestation(ctx.escrow, ctx.backend, "SubmissionAttestation", {
        bountyId: t.bountyId, claimVersion: 7, recipient: b.recipient, submissionRef: id("pr-1"),
      });
      await expect(ctx.escrow.registerSubmission(t.bountyId, 7, id("pr-1"), att))
        .to.be.revertedWithCustomError(ctx.escrow, "ClaimVersionMismatch").withArgs(1, 7);
      await expect(ctx.escrow.registerSubmission(t.bountyId, 1, ethers.ZeroHash, att)).to.be.revertedWithCustomError(ctx.escrow, "InvalidTerms");

      await time.increase(72 * HOUR);
      await expect(submit(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "ClaimHasExpired");

      const funded = await fund(ctx);
      await expect(ctx.escrow.registerSubmission(funded.bountyId, 1, id("pr-1"), att))
        .to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Funded);
    });

    it("a submission attestation cannot be reused as a settlement attestation (distinct EIP-712 types)", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      const s = await settlementFor(ctx, t);
      const wrongType = await mkAttestation(ctx.escrow, ctx.backend, "SubmissionAttestation", {
        bountyId: t.bountyId, claimVersion: s.claimVersion, recipient: s.recipient, submissionRef: id("pr-42"),
      });
      const approval = await mkAuth(ctx.escrow, ctx.maint, "PayoutApproval", s);
      await expect(ctx.escrow.settle(s, wrongType, approval)).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
    });

    it("a protected submission cannot expire and survives past the deadline", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      await time.increaseTo(t.submissionDeadline + 30 * DAY);
      expect(await ctx.escrow.effectiveStatus(t.bountyId)).to.equal(Status.Submitted);
      await expect(ctx.escrow.expireClaim(t.bountyId)).to.be.revertedWithCustomError(ctx.escrow, "ClaimNotExpired");
      // And settlement still works long after the deadline (review may take time).
      await expect(settle(ctx, t)).to.emit(ctx.escrow, "PayoutSettled");
    });
  });

  describe("settlement", function () {
    it("pays the bound recipient exactly the locked amount once, with a complete receipt event", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      const before = await ctx.token.balanceOf(ctx.contrib.address);
      await expect(settle(ctx, t))
        .to.emit(ctx.escrow, "PayoutSettled")
        .withArgs(
          t.bountyId, 1, ctx.contrib.address, ctx.tokenAddr, t.amount, t.criteriaHash,
          REVIEWED_SHA, MERGE_REF, REPORT_HASH, ctx.maint.address, ctx.backend.address, anyValue
        );
      expect(await ctx.token.balanceOf(ctx.contrib.address)).to.equal(before + t.amount);
      expect(await ctx.token.balanceOf(ctx.escrowAddr)).to.equal(0n);
      expect((await ctx.escrow.getBounty(t.bountyId)).status).to.equal(Status.Paid);
    });

    it("prevents double payout, including replay of the exact same attestation and approval", async function () {
      const ctx = await loadFixture(deploy);
      const other = await toSubmitted(ctx); // a second funded bounty whose funds must stay untouched
      const t = await toSubmitted(ctx);
      const s = await settlementFor(ctx, t);
      const { att, approval } = await signSettlement(ctx, s);
      await ctx.escrow.connect(ctx.relayer).settle(s, att, approval);

      await expect(ctx.escrow.connect(ctx.relayer).settle(s, att, approval))
        .to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Paid);
      // Even with fresh, validly signed evidence the bounty cannot pay twice.
      await expect(settle(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Paid);
      expect(await ctx.token.balanceOf(ctx.contrib.address)).to.equal(t.amount);
      expect(await ctx.token.balanceOf(ctx.escrowAddr)).to.equal(other.amount);
    });

    it("relayed/sponsored execution: any third party can submit it, and only the signers' authority counts", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      // The relayer holds no role at all, yet can relay both signatures.
      expect(await ctx.escrow.hasMaintainerRole(ctx.relayer.address)).to.equal(false);
      await expect(settle(ctx, t, { caller: ctx.relayer })).to.emit(ctx.escrow, "PayoutSettled");
    });

    it("the relayer's address alone is not a maintainer: calling settle yourself without a valid approval fails", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      const s = await settlementFor(ctx, t);
      const att = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", s);
      // The caller is the (role-less) relayer naming itself as the approver.
      const self = await mkAuth(ctx.escrow, ctx.relayer, "PayoutApproval", s);
      await expect(ctx.escrow.connect(ctx.relayer).settle(s, att, self))
        .to.be.revertedWithCustomError(ctx.escrow, "NotPayoutAuthority").withArgs(ctx.relayer.address);
      // Naming the maintainer as approver without their signature also fails, even though the caller relays.
      const forged = await mkAuth(ctx.escrow, ctx.maint, "PayoutApproval", s, { signWith: ctx.relayer });
      await expect(ctx.escrow.connect(ctx.relayer).settle(s, att, forged)).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
    });

    it("authorization by an ERC-1271 smart account is verified by signature and relayable", async function () {
      const ctx = await loadFixture(deploy);
      const account = await (await ethers.getContractFactory("MockSmartAccount")).deploy(ctx.controller.address);
      const accountAddr = await account.getAddress();
      await ctx.escrow.connect(ctx.repoOwner).setMaintainer(accountAddr, true);
      await ctx.escrow.connect(ctx.repoOwner).setSettlementWallet(accountAddr, true);
      const t = await toSubmitted(ctx);
      const s = await settlementFor(ctx, t);
      const att = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", s);
      // The controller key signs for the smart account; a third party relays.
      const approval = await mkAuth(ctx.escrow, accountAddr, "PayoutApproval", s, { signWith: ctx.controller });
      await expect(ctx.escrow.connect(ctx.relayer).settle(s, att, approval))
        .to.emit(ctx.escrow, "PayoutSettled").withArgs(
          t.bountyId, 1, ctx.contrib.address, ctx.tokenAddr, t.amount, t.criteriaHash,
          REVIEWED_SHA, MERGE_REF, REPORT_HASH, accountAddr, ctx.backend.address, anyValue
        );
    });

    it("a smart account can also call directly (msg.sender == signer) without a signature", async function () {
      const ctx = await loadFixture(deploy);
      const account = await (await ethers.getContractFactory("MockSmartAccount")).deploy(ctx.controller.address);
      const accountAddr = await account.getAddress();
      await ctx.escrow.connect(ctx.repoOwner).setMaintainer(accountAddr, true);
      const t = await fund(ctx);
      const b = await ctx.escrow.getBounty(t.bountyId);
      const auth = { signer: accountAddr, nonce: 991, deadline: (await time.latest()) + HOUR, signature: "0x" };
      const data = ctx.escrow.interface.encodeFunctionData("acceptClaim", [t.bountyId, ctx.contrib.address, auth]);
      await account.connect(ctx.controller).execute(ctx.escrowAddr, data);
      expect((await ctx.escrow.getBounty(t.bountyId)).recipient).to.equal(ctx.contrib.address);
      expect(b.claimVersion).to.equal(0);
    });

    it("a zero-ETH maintainer can accept a claim and approve a payout purely by signing (sponsored flow)", async function () {
      const ctx = await loadFixture(deploy);
      const payer = ethers.Wallet.createRandom();
      await ctx.escrow.connect(ctx.repoOwner).setMaintainer(payer.address, true);
      await ctx.escrow.connect(ctx.repoOwner).setSettlementWallet(payer.address, true);
      const t = await fund(ctx);
      await accept(ctx, t, ctx.contrib, { signer: payer });
      await submit(ctx, t);
      await expect(settle(ctx, t, { approver: payer })).to.emit(ctx.escrow, "PayoutSettled");
      expect(await ethers.provider.getBalance(payer.address)).to.equal(0n);
    });

    it("signatures are domain-separated by escrow address and chain id", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      const s = await settlementFor(ctx, t);

      // A second escrow deployment (e.g. another network) with the same roles/signer.
      const second = await (await ethers.getContractFactory("BountyEscrow")).deploy(ctx.repoOwner.address, ctx.backend.address, [ctx.tokenAddr]);
      const secondDomain = { name: "OpenBountyEscrow", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await second.getAddress() };
      const attForSecond = await mkAttestation(second, ctx.backend, "SettlementAttestation", s, { domain: secondDomain });
      const apprForSecond = await mkAuth(second, ctx.maint, "PayoutApproval", s, { domain: secondDomain });
      await expect(ctx.escrow.settle(s, attForSecond, apprForSecond)).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");

      // Same contract address but a different chain id in the signed domain.
      const wrongChain = { ...secondDomain, verifyingContract: ctx.escrowAddr, chainId: 1 };
      const att = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", s, { domain: wrongChain });
      const appr = await mkAuth(ctx.escrow, ctx.maint, "PayoutApproval", s);
      await expect(ctx.escrow.settle(s, att, appr)).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
    });

    describe("rejections", function () {
      it("unauthorized attestation signer (outsider, repo owner, 'AI service' key, the approver)", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toSubmitted(ctx);
        for (const bad of [ctx.outsider, ctx.repoOwner, ctx.contrib, ctx.maint]) {
          await expect(settle(ctx, t, { backend: bad })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
        }
      });

      it("unauthorized approver (contributor, outsider, forged signature)", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toSubmitted(ctx);
        await expect(settle(ctx, t, { approver: ctx.outsider })).to.be.revertedWithCustomError(ctx.escrow, "NotPayoutAuthority");
        await expect(settle(ctx, t, { approver: ctx.contrib })).to.be.revertedWithCustomError(ctx.escrow, "NotPayoutAuthority");
        // The backend key alone cannot stand in for the human.
        await expect(settle(ctx, t, { approver: ctx.backend })).to.be.revertedWithCustomError(ctx.escrow, "NotPayoutAuthority");
        // Maintainer named but someone else signed.
        await expect(settle(ctx, t, { approvalOpts: { signWith: ctx.outsider } })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
      });

      it("both authorizations are required: attestation without approval or approval without attestation fail", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toSubmitted(ctx);
        const s = await settlementFor(ctx, t);
        const { att, approval } = await signSettlement(ctx, s);
        await expect(ctx.escrow.settle(s, { ...att, signature: "0x" }, approval)).to.be.reverted;
        await expect(ctx.escrow.settle(s, att, { ...approval, signature: "0x" })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
        // The approver's own direct call needs the attestation too: no backend evidence, no payout.
        const noAtt = await mkAttestation(ctx.escrow, ctx.maint, "SettlementAttestation", s);
        const direct = { signer: ctx.maint.address, nonce: 5, deadline: (await time.latest()) + HOUR, signature: "0x" };
        await expect(ctx.escrow.connect(ctx.maint).settle(s, noAtt, direct)).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
      });

      it("wrong recipient: cannot redirect to anyone other than the bound claimant", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toSubmitted(ctx);
        await expect(settle(ctx, t, { overrides: { recipient: ctx.outsider.address } }))
          .to.be.revertedWithCustomError(ctx.escrow, "SettlementMismatch");
        await expect(settle(ctx, t, { overrides: { recipient: ctx.contrib2.address } }))
          .to.be.revertedWithCustomError(ctx.escrow, "SettlementMismatch");
        // Both signers agreeing on a different recipient than calldata also fails.
        const s = await settlementFor(ctx, t);
        const evil = { ...s, recipient: ctx.outsider.address };
        const { att, approval } = await signSettlement(ctx, evil);
        await expect(ctx.escrow.settle(s, att, approval)).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
        expect(await ctx.token.balanceOf(ctx.outsider.address)).to.equal(0n);
      });

      it("altered terms: amount, criteria hash and bounty id must match what was locked", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toSubmitted(ctx);
        const other = await toSubmitted(ctx);
        await expect(settle(ctx, t, { overrides: { amount: t.amount + 1n } })).to.be.revertedWithCustomError(ctx.escrow, "SettlementMismatch");
        await expect(settle(ctx, t, { overrides: { amount: t.amount - 1n } })).to.be.revertedWithCustomError(ctx.escrow, "SettlementMismatch");
        await expect(settle(ctx, t, { overrides: { criteriaHash: id("criteria-v2") } })).to.be.revertedWithCustomError(ctx.escrow, "SettlementMismatch");
        // Evidence for bounty A cannot be applied to bounty B.
        const sA = await settlementFor(ctx, t);
        const { att, approval } = await signSettlement(ctx, sA);
        await expect(ctx.escrow.settle({ ...sA, bountyId: other.bountyId }, att, approval)).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
        // Zeroed evidence fields are rejected.
        for (const k of ["reviewedSha", "mergeRef", "reportHash"]) {
          await expect(settle(ctx, t, { overrides: { [k]: ethers.ZeroHash } })).to.be.revertedWithCustomError(ctx.escrow, "SettlementMismatch");
        }
      });

      it("attestation and approval must agree on every evidence field (SHA, merge ref, report hash)", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toSubmitted(ctx);
        const s = await settlementFor(ctx, t);
        for (const [k, v] of [["reviewedSha", id("other-sha")], ["mergeRef", id("other-merge")], ["reportHash", id("other-report")]]) {
          // Backend attested a different value than the human approved and than calldata states.
          await expect(settle(ctx, t, { attFields: { ...s, [k]: v } })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
          await expect(settle(ctx, t, { approvalFields: { ...s, [k]: v } })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
        }
        expect((await ctx.escrow.getBounty(t.bountyId)).status).to.equal(Status.Submitted);
      });

      it("stale attestation: a superseded claim version cannot settle", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toClaimed(ctx, {}, ctx.contrib); // claim v1
        await time.increase(72 * HOUR); // v1 expires unsubmitted
        await accept(ctx, t, ctx.contrib2); // claim v2
        await submit(ctx, t);
        const s2 = await settlementFor(ctx, t);
        expect(s2.claimVersion).to.equal(2);

        // Old evidence about v1 / the v1 claimant.
        await expect(settle(ctx, t, { overrides: { claimVersion: 1 } }))
          .to.be.revertedWithCustomError(ctx.escrow, "ClaimVersionMismatch").withArgs(2, 1);
        await expect(settle(ctx, t, { overrides: { recipient: ctx.contrib.address } }))
          .to.be.revertedWithCustomError(ctx.escrow, "SettlementMismatch");
        // Backend attested v1 but calldata claims v2.
        await expect(settle(ctx, t, { attFields: { ...s2, claimVersion: 1 } })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
        // v2 settles normally and pays only the v2 claimant.
        await expect(settle(ctx, t)).to.emit(ctx.escrow, "PayoutSettled");
        expect(await ctx.token.balanceOf(ctx.contrib2.address)).to.equal(t.amount);
        expect(await ctx.token.balanceOf(ctx.contrib.address)).to.equal(0n);
      });

      it("expired attestation and over-long attestation TTL", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toSubmitted(ctx);
        const s = await settlementFor(ctx, t);
        const att = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", s, { ttl: 60 });
        const approval = await mkAuth(ctx.escrow, ctx.maint, "PayoutApproval", s, { ttl: 6 * HOUR });
        await time.increase(120);
        await expect(ctx.escrow.settle(s, att, approval)).to.be.revertedWithCustomError(ctx.escrow, "AttestationExpired");

        const longLived = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", s, { ttl: 2 * HOUR });
        await expect(ctx.escrow.settle(s, longLived, approval)).to.be.revertedWithCustomError(ctx.escrow, "AttestationTtlTooLong");

        // A fresh attestation inside the TTL works with the still-valid approval.
        const fresh = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", s);
        await expect(ctx.escrow.settle(s, fresh, approval)).to.emit(ctx.escrow, "PayoutSettled");
      });

      it("expired or over-long human approvals are rejected", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toSubmitted(ctx);
        // Control: a short-lived approval is accepted while it is still valid.
        await expect(settle(ctx, t, { approvalOpts: { ttl: 30 } })).to.emit(ctx.escrow, "PayoutSettled");
        const t2 = await toSubmitted(ctx);
        const s = await settlementFor(ctx, t2);
        const att = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", s, { ttl: 3000 });
        const shortLived = await mkAuth(ctx.escrow, ctx.maint, "PayoutApproval", s, { ttl: 30 });
        const tooLong = await mkAuth(ctx.escrow, ctx.maint, "PayoutApproval", s, { ttl: 25 * HOUR });
        await expect(ctx.escrow.settle(s, att, tooLong)).to.be.revertedWithCustomError(ctx.escrow, "AuthTtlTooLong");
        await time.increase(60);
        await expect(ctx.escrow.settle(s, att, shortLived)).to.be.revertedWithCustomError(ctx.escrow, "AuthExpired");
      });

      it("replayed attestation nonce cannot be reused on another bounty", async function () {
        const ctx = await loadFixture(deploy);
        const a = await toSubmitted(ctx);
        const b = await toSubmitted(ctx);
        const sA = await settlementFor(ctx, a);
        const attA = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", sA, { nonce: 777n });
        const apprA = await mkAuth(ctx.escrow, ctx.maint, "PayoutApproval", sA);
        await ctx.escrow.settle(sA, attA, apprA);
        expect(await ctx.escrow.usedAttestationNonce(ctx.backend.address, 777n)).to.equal(true);

        const sB = await settlementFor(ctx, b);
        const attB = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", sB, { nonce: 777n });
        const apprB = await mkAuth(ctx.escrow, ctx.maint, "PayoutApproval", sB);
        await expect(ctx.escrow.settle(sB, attB, apprB)).to.be.revertedWithCustomError(ctx.escrow, "NonceAlreadyUsed");
        expect((await ctx.escrow.getBounty(b.bountyId)).status).to.equal(Status.Submitted);
      });

      it("a human approval nonce is single-use and the signer can invalidate it before it is relayed", async function () {
        const ctx = await loadFixture(deploy);
        const t = await toSubmitted(ctx);
        const s = await settlementFor(ctx, t);
        const att = await mkAttestation(ctx.escrow, ctx.backend, "SettlementAttestation", s);
        const approval = await mkAuth(ctx.escrow, ctx.maint, "PayoutApproval", s, { nonce: 4242n });
        await expect(ctx.escrow.connect(ctx.maint).invalidateNonce(4242n))
          .to.emit(ctx.escrow, "NonceInvalidated").withArgs(ctx.maint.address, 4242n);
        await expect(ctx.escrow.settle(s, att, approval)).to.be.revertedWithCustomError(ctx.escrow, "NonceAlreadyUsed");
        // The maintainer can sign a new one.
        await expect(settle(ctx, t)).to.emit(ctx.escrow, "PayoutSettled");
      });

      it("self-payment: an approver cannot pay themselves", async function () {
        const ctx = await loadFixture(deploy);
        // maint2 (recipient) later also becomes a payout authority; owner accepts them as claimant.
        const t = await fund(ctx);
        await accept(ctx, t, ctx.maint2, { signer: ctx.repoOwner });
        await submit(ctx, t);
        await ctx.escrow.connect(ctx.repoOwner).setSettlementWallet(ctx.maint2.address, true);
        await expect(settle(ctx, t, { approver: ctx.maint2 })).to.be.revertedWithCustomError(ctx.escrow, "SelfPayment");
        await expect(settle(ctx, t, { approver: ctx.maint })).to.emit(ctx.escrow, "PayoutSettled");
      });

      it("cannot settle before submission registration or after a refund", async function () {
        const ctx = await loadFixture(deploy);
        const unclaimed = await fund(ctx);
        const claimed = await toClaimed(ctx);
        const sC = { ...(await settlementFor(ctx, claimed)) };
        const { att, approval } = await signSettlement(ctx, sC);
        await expect(ctx.escrow.settle(sC, att, approval)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Claimed);
        const sU = { ...sC, bountyId: unclaimed.bountyId };
        await expect(ctx.escrow.settle(sU, att, approval)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Funded);
        await refund(ctx, unclaimed);
        await expect(ctx.escrow.settle(sU, att, approval)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Refunded);
      });
    });
  });

  describe("refund rules", function () {
    it("before any claim: refunds the ORIGINAL FUNDER even when another maintainer or the owner triggers it", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx); // funder = maint
      const funderBefore = await ctx.token.balanceOf(ctx.maint.address);
      const ownerBefore = await ctx.token.balanceOf(ctx.repoOwner.address);
      await expect(refund(ctx, t, { signer: ctx.repoOwner }))
        .to.emit(ctx.escrow, "BountyRefunded")
        .withArgs(t.bountyId, ctx.maint.address, ctx.tokenAddr, t.amount, Reason.NoActiveClaim, ctx.repoOwner.address);
      expect(await ctx.token.balanceOf(ctx.maint.address)).to.equal(funderBefore + t.amount);
      expect(await ctx.token.balanceOf(ctx.repoOwner.address)).to.equal(ownerBefore);
      expect((await ctx.escrow.getBounty(t.bountyId)).status).to.equal(Status.Refunded);
    });

    it("the funder can refund via a relayed signature even after losing the maintainer role", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      await ctx.escrow.connect(ctx.repoOwner).setMaintainer(ctx.maint.address, false);
      await expect(refund(ctx, t, { signer: ctx.maint })).to.emit(ctx.escrow, "BountyRefunded");
    });

    it("rejects refunds requested by a contributor, outsider or the claimant", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      for (const who of [ctx.contrib, ctx.outsider, ctx.backend]) {
        await expect(refund(ctx, t, { signer: who })).to.be.revertedWithCustomError(ctx.escrow, "NotRefundAuthority");
      }
    });

    it("while a claim is active (before expiry) a unilateral refund is rejected", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toClaimed(ctx);
      await expect(refund(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Claimed);
      await expect(refund(ctx, t, { signer: ctx.repoOwner })).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Claimed);
    });

    it("after a claim expires without a submission the bounty is refundable (releasing a claim itself never refunds)", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toClaimed(ctx);
      await time.increase(72 * HOUR);
      await expect(refund(ctx, t))
        .to.emit(ctx.escrow, "ClaimExpired").and.to.emit(ctx.escrow, "BountyRefunded")
        .withArgs(t.bountyId, ctx.maint.address, ctx.tokenAddr, t.amount, Reason.NoActiveClaim, ctx.maint.address);
      expect(await ctx.token.balanceOf(ctx.escrowAddr)).to.equal(0n);
    });

    it("after the deadline with no claim: refundable, reason DeadlinePassed", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      await time.increaseTo(t.submissionDeadline);
      await expect(refund(ctx, t))
        .to.emit(ctx.escrow, "BountyRefunded")
        .withArgs(t.bountyId, ctx.maint.address, ctx.tokenAddr, t.amount, Reason.DeadlinePassed, ctx.maint.address);
    });

    it("after the deadline with a claimed-but-unsubmitted bounty: refundable", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toClaimed(ctx, { submissionDeadline: (await time.latest()) + 5 * DAY });
      await time.increaseTo(t.submissionDeadline + 1);
      await expect(refund(ctx, t)).to.emit(ctx.escrow, "BountyRefunded");
    });

    it("a protected submission blocks refunds, before and after the deadline", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      await expect(refund(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Submitted);
      await time.increaseTo(t.submissionDeadline + 1);
      await expect(refund(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Submitted);
      await expect(refund(ctx, t, { signer: ctx.repoOwner })).to.be.revertedWithCustomError(ctx.escrow, "BadStatus");
      expect(await ctx.token.balanceOf(ctx.escrowAddr)).to.equal(t.amount); // stays locked
    });

    it("cannot refund twice, after payout, or an unknown bounty; a refunded bounty cannot be claimed", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      await refund(ctx, t);
      await expect(refund(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Refunded);
      await expect(accept(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Refunded);
      const paid = await toSubmitted(ctx);
      await settle(ctx, paid);
      await expect(refund(ctx, paid)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Paid);
      await expect(refund(ctx, { bountyId: id("ghost") })).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Draft);
    });
  });

  describe("mutual cancellation", function () {
    it("claimed work: funder-side and claimant both sign, funds return to the original funder", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toClaimed(ctx);
      const before = await ctx.token.balanceOf(ctx.maint.address);
      await expect(cancel(ctx, t))
        .to.emit(ctx.escrow, "BountyRefunded")
        .withArgs(t.bountyId, ctx.maint.address, ctx.tokenAddr, t.amount, Reason.MutualCancellation, ctx.maint.address);
      expect(await ctx.token.balanceOf(ctx.maint.address)).to.equal(before + t.amount);
      expect((await ctx.escrow.getBounty(t.bountyId)).status).to.equal(Status.Refunded);
    });

    it("submitted work can be cancelled only by mutual agreement", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      await expect(refund(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus");
      await expect(cancel(ctx, t, { funderSide: ctx.repoOwner })).to.emit(ctx.escrow, "BountyRefunded");
      expect((await ctx.escrow.getBounty(t.bountyId)).status).to.equal(Status.Refunded);
    });

    it("a single party cannot cancel: the claimant signature must come from the bound recipient", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toSubmitted(ctx);
      await expect(cancel(ctx, t, { claimant: ctx.contrib2 })).to.be.revertedWithCustomError(ctx.escrow, "InvalidRecipient");
      await expect(cancel(ctx, t, { claimantOpts: { signWith: ctx.outsider } })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
      await expect(cancel(ctx, t, { funderOpts: { signWith: ctx.outsider } })).to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
      // Funder-side must be the funder or a maintainer, never the claimant or an outsider.
      await expect(cancel(ctx, t, { funderSide: ctx.outsider })).to.be.revertedWithCustomError(ctx.escrow, "NotRefundAuthority");
      expect((await ctx.escrow.getBounty(t.bountyId)).status).to.equal(Status.Submitted);
    });

    it("the two consents must come from distinct parties", async function () {
      const ctx = await loadFixture(deploy);
      const t = await fund(ctx);
      await accept(ctx, t, ctx.maint2, { signer: ctx.repoOwner }); // recipient is itself a maintainer
      await expect(cancel(ctx, t, { funderSide: ctx.maint2, claimant: ctx.maint2 }))
        .to.be.revertedWithCustomError(ctx.escrow, "PartiesNotDistinct");
    });

    it("is bound to the claim version and replay-protected; not available on unclaimed, paid or refunded bounties", async function () {
      const ctx = await loadFixture(deploy);
      const t = await toClaimed(ctx);
      await expect(cancel(ctx, t, { version: 2 })).to.be.revertedWithCustomError(ctx.escrow, "ClaimVersionMismatch").withArgs(1, 2);

      // Consents signed for v1 cannot be replayed on v2 after expiry and re-acceptance.
      const f = { bountyId: t.bountyId, claimVersion: 1 };
      const oldFunder = await mkAuth(ctx.escrow, ctx.maint, "CancelByAgreement", f);
      const oldClaimant = await mkAuth(ctx.escrow, ctx.contrib, "CancelByAgreement", f);
      await time.increase(72 * HOUR);
      await accept(ctx, t, ctx.contrib);
      await expect(ctx.escrow.cancelByAgreement(t.bountyId, 1, oldFunder, oldClaimant))
        .to.be.revertedWithCustomError(ctx.escrow, "ClaimVersionMismatch").withArgs(2, 1);

      const unclaimed = await fund(ctx);
      await expect(cancel(ctx, unclaimed)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Funded);
      await cancel(ctx, t);
      await expect(cancel(ctx, t)).to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Refunded);
    });
  });

  describe("reentrancy", function () {
    async function reentrantSetup(ctx) {
      const re = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const reAddr = await re.getAddress();
      await ctx.escrow.connect(ctx.repoOwner).setTokenAllowed(reAddr, true);
      await re.mint(ctx.maint.address, usdt(100000));
      await re.connect(ctx.maint).approve(ctx.escrowAddr, ethers.MaxUint256);
      return { re, reAddr };
    }

    async function expectBlocked(re, escrow) {
      expect(await re.attackAttempted()).to.equal(true);
      expect(await re.attackSucceeded()).to.equal(false);
      expect((await re.attackRevertData()).slice(0, 10)).to.equal(REENTRANCY_SELECTOR);
    }

    it("a callback token cannot re-enter during the payout transfer, and the payout still happens exactly once", async function () {
      const ctx = await loadFixture(deploy);
      const { re, reAddr } = await reentrantSetup(ctx);
      const t = await toSubmitted(ctx, { token: reAddr });
      const victim = await fund(ctx, { token: reAddr });
      const auth = await mkAuth(ctx.escrow, ctx.maint, "Refund", { bountyId: victim.bountyId });
      await re.arm(ctx.escrowAddr, ctx.escrow.interface.encodeFunctionData("refund", [victim.bountyId, auth]));

      await settle(ctx, t);
      await expectBlocked(re);
      expect(await re.balanceOf(ctx.contrib.address)).to.equal(t.amount);
      expect((await ctx.escrow.getBounty(victim.bountyId)).status).to.equal(Status.Funded);
      expect(await re.balanceOf(ctx.escrowAddr)).to.equal(victim.amount);
    });

    it("a callback token cannot re-enter during the refund transfer", async function () {
      const ctx = await loadFixture(deploy);
      const { re, reAddr } = await reentrantSetup(ctx);
      const t = await fund(ctx, { token: reAddr });
      const victim = await fund(ctx, { token: reAddr });
      const auth = await mkAuth(ctx.escrow, ctx.maint, "Refund", { bountyId: victim.bountyId });
      await re.arm(ctx.escrowAddr, ctx.escrow.interface.encodeFunctionData("refund", [victim.bountyId, auth]));

      await refund(ctx, t);
      await expectBlocked(re);
      expect((await ctx.escrow.getBounty(t.bountyId)).status).to.equal(Status.Refunded);
      expect((await ctx.escrow.getBounty(victim.bountyId)).status).to.equal(Status.Funded);
      expect(await re.balanceOf(ctx.escrowAddr)).to.equal(victim.amount);
    });

    it("a callback token cannot re-enter during funding", async function () {
      const ctx = await loadFixture(deploy);
      const { re, reAddr } = await reentrantSetup(ctx);
      const nested = await newTerms(ctx, { token: reAddr });
      await re.arm(ctx.escrowAddr, ctx.escrow.interface.encodeFunctionData("fund", [nested]));
      const outer = await newTerms(ctx, { token: reAddr });
      await ctx.escrow.connect(ctx.maint).fund(outer);
      await expectBlocked(re);
      expect((await ctx.escrow.getBounty(nested.bountyId)).status).to.equal(Status.Draft);
      expect(await re.balanceOf(ctx.escrowAddr)).to.equal(outer.amount);
    });
  });

  describe("accounting and events", function () {
    it("escrow balance always equals the sum of open (Funded/Claimed/Submitted) bounties", async function () {
      const ctx = await loadFixture(deploy);
      const funded = await fund(ctx, { amount: usdt(10) });
      const claimed = await toClaimed(ctx, { amount: usdt(20) });
      const submitted = await toSubmitted(ctx, { amount: usdt(30) });
      const paid = await toSubmitted(ctx, { amount: usdt(40) });
      const refunded = await fund(ctx, { amount: usdt(50) });
      await settle(ctx, paid);
      await refund(ctx, refunded);
      const open = funded.amount + claimed.amount + submitted.amount;
      expect(await ctx.token.balanceOf(ctx.escrowAddr)).to.equal(open);
    });

    it("emitted events are sufficient to rebuild every bounty's state", async function () {
      const ctx = await loadFixture(deploy);
      const ids = [];
      ids.push(await fund(ctx)); // Funded
      ids.push(await toClaimed(ctx)); // Claimed
      ids.push(await toSubmitted(ctx)); // Submitted
      const paid = await toSubmitted(ctx); ids.push(paid);
      await settle(ctx, paid); // Paid
      const refunded = await fund(ctx); ids.push(refunded);
      await refund(ctx, refunded); // Refunded
      const expired = await toClaimed(ctx); ids.push(expired);
      const cancelled = await toSubmitted(ctx); ids.push(cancelled);
      await cancel(ctx, cancelled); // Refunded via mutual cancellation
      await time.increase(72 * HOUR + 1); // `expired` and `claimed` claims lapse (lazily)

      const names = ["BountyFunded", "ClaimAccepted", "ClaimExpired", "SubmissionRegistered", "PayoutSettled", "BountyRefunded"];
      const logs = [];
      for (const n of names) logs.push(...(await ctx.escrow.queryFilter(ctx.escrow.filters[n]())));
      logs.sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

      const state = {}; // what an indexer would hold
      for (const l of logs) {
        const bid = l.args.bountyId;
        switch (l.eventName) {
          case "BountyFunded": state[bid] = { status: Status.Funded, amount: l.args.amount, funder: l.args.funder }; break;
          case "ClaimAccepted": Object.assign(state[bid], { status: Status.Claimed, recipient: l.args.recipient, version: l.args.claimVersion, claimExpiry: l.args.claimExpiry }); break;
          case "ClaimExpired": Object.assign(state[bid], { status: Status.Funded, recipient: null }); break;
          case "SubmissionRegistered": state[bid].status = Status.Submitted; break;
          case "PayoutSettled": state[bid].status = Status.Paid; state[bid].paidTo = l.args.recipient; break;
          case "BountyRefunded": state[bid].status = Status.Refunded; break;
        }
      }
      const now = await time.latest();
      for (const t of ids) {
        const s = state[t.bountyId];
        // Claim expiry is lazy onchain; an indexer applies the claimExpiry deadline carried by ClaimAccepted.
        const derived = s.status === Status.Claimed && now >= Number(s.claimExpiry) ? Status.Funded : s.status;
        expect(derived, t.bountyId).to.equal(await ctx.escrow.effectiveStatus(t.bountyId));
        if (s.paidTo) expect(s.paidTo).to.equal((await ctx.escrow.getBounty(t.bountyId)).recipient);
      }
    });
  });
});
