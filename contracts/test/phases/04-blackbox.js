const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const {
  Status, Reason, HOUR, DAY, deploy, newTerms, fund, accept, submit, toClaimed, toSubmitted,
  settlementFor, signSettlement, settle, refund, cancel,
} = require("../fixtures");
const { usdt, id, freshNonce, mkAuth, mkAttestation } = require("../helpers");

const gasLimit = 2_000_000; // Mine at the exact timestamp rather than failing during gas estimation.
const aroundRange = (max) => [-1, 0, 1, Math.floor(max / 2), max - 1, max, max + 1];

describe("04 Black box: behavior through public inputs and outputs", function () {
  describe("Robust boundary-value analysis", function () {
    const balance = usdt(1_000_000);
    for (const amount of [0n, 1n, 2n, balance / 2n, balance - 1n, balance, balance + 1n]) {
      it(`funds amount ${amount} base units only within [1, available balance]`, async function () {
        const c = await loadFixture(deploy);
        const t = await newTerms(c, { amount });
        const tx = c.escrow.connect(c.maint).fund(t);
        if (amount === 0n) {
          await expect(tx).to.be.revertedWithCustomError(c.escrow, "InvalidTerms");
        } else if (amount > balance) {
          await expect(tx).to.be.revertedWithCustomError(c.token, "ERC20InsufficientBalance");
        } else {
          await expect(tx).to.changeTokenBalances(c.token, [c.maint, c.escrow], [-amount, amount]);
          expect((await c.escrow.getBounty(t.bountyId)).amount).to.equal(amount);
          return;
        }
        expect((await c.escrow.getBounty(t.bountyId)).status).to.equal(Status.Draft);
      });
    }

    for (const [field, max] of [["human approval", DAY], ["backend attestation", HOUR]]) {
      for (const offset of aroundRange(max)) {
        it(`${field}: remaining validity ${offset}s at execution (valid range 0–${max}s)`, async function () {
          const c = await loadFixture(deploy);
          const t = await toSubmitted(c);
          const s = await settlementFor(c, t);
          const at = (await time.latest()) + 10;
          const human = field === "human approval";
          const opts = human ? { approvalOpts: { deadline: at + offset } } : { attOpts: { expiry: at + offset } };
          const { att, approval } = await signSettlement(c, s, opts);
          await time.setNextBlockTimestamp(at);
          const tx = c.escrow.connect(c.relayer).settle(s, att, approval, { gasLimit });
          if (offset < 0 || offset > max) {
            const error = human
              ? (offset < 0 ? "AuthExpired" : "AuthTtlTooLong")
              : (offset < 0 ? "AttestationExpired" : "AttestationTtlTooLong");
            await expect(tx).to.be.revertedWithCustomError(c.escrow, error);
            expect((await c.escrow.getBounty(t.bountyId)).status).to.equal(Status.Submitted);
          } else {
            await expect(tx).to.emit(c.escrow, "PayoutSettled");
          }
          expect(await time.latest()).to.equal(at);
        });
      }
    }

    for (const offset of [-1, 0, 1]) {
      it(`submission at claim expiry ${offset >= 0 ? "+" : ""}${offset}s`, async function () {
        const c = await loadFixture(deploy);
        const t = await toClaimed(c);
        const b = await c.escrow.getBounty(t.bountyId);
        const at = Number(b.claimExpiry) + offset;
        const submissionRef = id("pr-boundary");
        const att = await mkAttestation(c.escrow, c.backend, "SubmissionAttestation", {
          bountyId: t.bountyId, claimVersion: b.claimVersion, recipient: b.recipient, submissionRef,
        }, { expiry: at + 60 });
        await time.setNextBlockTimestamp(at);
        const tx = c.escrow.connect(c.relayer).registerSubmission(
          t.bountyId, b.claimVersion, submissionRef, att, { gasLimit }
        );
        if (offset < 0) await expect(tx).to.emit(c.escrow, "SubmissionRegistered");
        else await expect(tx).to.be.revertedWithCustomError(c.escrow, "ClaimHasExpired");
        expect(await time.latest()).to.equal(at);
      });

      it(`funding with submission deadline at execution ${offset >= 0 ? "+" : ""}${offset}s`, async function () {
        const c = await loadFixture(deploy);
        const at = (await time.latest()) + 10;
        const t = await newTerms(c, { submissionDeadline: at + offset });
        await time.setNextBlockTimestamp(at);
        const tx = c.escrow.connect(c.maint).fund(t, { gasLimit });
        if (offset > 0) await expect(tx).to.emit(c.escrow, "BountyFunded");
        else await expect(tx).to.be.revertedWithCustomError(c.escrow, "InvalidTerms");
        expect(await time.latest()).to.equal(at);
      });
    }
  });

  describe("1. Equivalence partitioning: eligible and ineligible recipient classes", function () {
    for (const group of ["contributor", "zero", "escrow", "token", "funder", "approver"]) {
      it(group, async function () {
        const c = await loadFixture(deploy);
        const t = await fund(c);
        const recipient = {
          contributor: c.contrib.address, zero: ethers.ZeroAddress, escrow: c.escrowAddr,
          token: c.tokenAddr, funder: c.maint.address, approver: c.maint2.address,
        }[group];
        const tx = accept(c, t, recipient, { signer: c.maint2 });
        if (group === "contributor") {
          await expect(tx).to.emit(c.escrow, "ClaimAccepted");
          expect((await c.escrow.getBounty(t.bountyId)).recipient).to.equal(recipient);
        } else {
          const error = ["funder", "approver"].includes(group) ? "SelfPayment" : "InvalidRecipient";
          await expect(tx).to.be.revertedWithCustomError(c.escrow, error);
          expect((await c.escrow.getBounty(t.bountyId)).status).to.equal(Status.Funded);
        }
      });
    }
  });

  describe("2. Decision table: independent authorizations for payout", function () {
    for (const backendOK of [true, false]) for (const humanOK of [true, false]) {
      it(`backend=${backendOK}, human=${humanOK}: pays only if both are valid`, async function () {
        const c = await loadFixture(deploy);
        const t = await toSubmitted(c);
        const s = await settlementFor(c, t);
        const { att, approval } = await signSettlement(c, s, {
          attOpts: backendOK ? {} : { signWith: c.outsider },
          approvalOpts: humanOK ? {} : { signWith: c.outsider },
        });
        const tx = c.escrow.connect(c.relayer).settle(s, att, approval);
        if (backendOK && humanOK) await expect(tx).to.emit(c.escrow, "PayoutSettled");
        else await expect(tx).to.be.revertedWithCustomError(c.escrow, "InvalidSignature");
        expect(await c.token.balanceOf(c.contrib.address)).to.equal(backendOK && humanOK ? t.amount : 0n);
      });
    }
  });

  describe("3. State transitions", function () {
    it("rejects invalid transitions and preserves terminal states", async function () {
      const c = await loadFixture(deploy);
      const t = await newTerms(c);
      await expect(accept(c, t)).to.be.revertedWithCustomError(c.escrow, "BadStatus").withArgs(Status.Draft);
      await c.escrow.connect(c.maint).fund(t);
      await expect(submit(c, t)).to.be.revertedWithCustomError(c.escrow, "BadStatus").withArgs(Status.Funded);
      await accept(c, t);
      await expect(accept(c, t, c.contrib2)).to.be.revertedWithCustomError(c.escrow, "BadStatus").withArgs(Status.Claimed);
      await submit(c, t);
      await expect(refund(c, t)).to.be.revertedWithCustomError(c.escrow, "BadStatus").withArgs(Status.Submitted);
      await settle(c, t);
      await expect(refund(c, t)).to.be.revertedWithCustomError(c.escrow, "BadStatus").withArgs(Status.Paid);
      const r = await fund(c);
      await refund(c, r);
      await expect(accept(c, r)).to.be.revertedWithCustomError(c.escrow, "BadStatus").withArgs(Status.Refunded);
    });
  });

  describe("4. Pairwise combinations: maintainer role × signature × recipient", function () {
    // Three binary factors, four rows; every pair of columns contains all four possible value pairs.
    const rows = [[true, true, true], [true, false, false], [false, true, false], [false, false, true]];
    for (const [hasRole, validSig, validRecipient] of rows) {
      it(`role=${hasRole}, signature=${validSig}, recipient=${validRecipient}`, async function () {
        const c = await loadFixture(deploy);
        const t = await fund(c);
        const signer = hasRole ? c.maint2 : c.outsider;
        const recipient = validRecipient ? c.contrib.address : ethers.ZeroAddress;
        const tx = accept(c, t, recipient, { signer, opts: validSig ? {} : { signWith: c.controller } });
        if (hasRole && validSig && validRecipient) await expect(tx).to.emit(c.escrow, "ClaimAccepted");
        else await expect(tx).to.be.reverted;
        expect((await c.escrow.getBounty(t.bountyId)).recipient).to.equal(
          hasRole && validSig && validRecipient ? recipient : ethers.ZeroAddress
        );
      });
    }
  });

  describe("5. Use-case scenarios", function () {
    it("a departed maintainer and a contributor cancel protected work, returning funds to the original funder", async function () {
      const c = await loadFixture(deploy);
      const t = await toSubmitted(c);
      await c.escrow.connect(c.repoOwner).setMaintainer(c.maint.address, false);
      await expect(refund(c, t)).to.be.revertedWithCustomError(c.escrow, "BadStatus");
      await expect(cancel(c, t)).to.changeTokenBalances(c.token, [c.escrow, c.maint], [-t.amount, t.amount]);
      expect((await c.escrow.getBounty(t.bountyId)).status).to.equal(Status.Refunded);
    });
  });

  describe("6. Cause–effect graph: authority AND (unclaimed OR expired) AND no protected submission → refund", function () {
    for (const scenario of ["unclaimed", "active", "expired", "protected", "unauthorized"]) {
      it(scenario, async function () {
        const c = await loadFixture(deploy);
        const t = await fund(c, { submissionDeadline: (await time.latest()) + HOUR });
        if (["active", "expired", "protected"].includes(scenario)) await accept(c, t);
        if (scenario === "protected") await submit(c, t);
        if (["expired", "protected"].includes(scenario)) await time.increaseTo(t.submissionDeadline);
        const tx = refund(c, t, { signer: scenario === "unauthorized" ? c.outsider : c.maint });
        if (["unclaimed", "expired"].includes(scenario)) {
          const reason = scenario === "expired" ? Reason.DeadlinePassed : Reason.NoActiveClaim;
          await expect(tx).to.emit(c.escrow, "BountyRefunded").withArgs(
            t.bountyId, c.maint.address, c.tokenAddr, t.amount, reason, c.maint.address
          );
        } else {
          const error = scenario === "unauthorized" ? "NotRefundAuthority" : "BadStatus";
          await expect(tx).to.be.revertedWithCustomError(c.escrow, error);
          expect(await c.token.balanceOf(c.escrowAddr)).to.equal(t.amount);
        }
      });
    }
  });
});
