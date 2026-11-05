const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { Status, deploy, fund, toSubmitted, settlementFor, signSettlement, refund, toClaimed } =
  require("../fixtures");
const { mkAuth, id } = require("../helpers");

async function withProbe() {
  const c = await deploy();
  const probe = await (await ethers.getContractFactory("EscrowTransferProbe")).deploy();
  const address = await probe.getAddress();
  await c.escrow.connect(c.repoOwner).setTokenAllowed(address, true);
  await probe.mint(c.maint.address, 10_000_000_000n);
  await probe.connect(c.maint).approve(c.escrowAddr, ethers.MaxUint256);
  return { ...c, probe, probeAddress: address };
}

describe("05 White box: execution order, rollback and trust assumptions", function () {
  it("sets Paid before the token interaction; a reverting transfer rolls back status and both consumed nonces", async function () {
    const c = await loadFixture(withProbe);
    const t = await toSubmitted(c, { token: c.probeAddress });
    const s = await settlementFor(c, t);
    const { att, approval } = await signSettlement(c, s);
    await c.probe.watch(c.escrowAddr, t.bountyId, Status.Paid, true);
    const pay = () => c.escrow.connect(c.relayer).settle(s, att, approval);
    await expect(pay()).to.be.revertedWithCustomError(c.probe, "TransferRejected");
    expect((await c.escrow.getBounty(t.bountyId)).status).to.equal(Status.Submitted);
    expect(await c.escrow.usedAuthNonce(c.maint.address, approval.nonce)).to.equal(false);
    expect(await c.escrow.usedAttestationNonce(c.backend.address, att.nonce)).to.equal(false);
    expect(await c.probe.balanceOf(c.escrowAddr)).to.equal(t.amount);
    expect(await c.probe.observedTransfers()).to.equal(0n);

    await c.probe.watch(c.escrowAddr, t.bountyId, Status.Paid, false);
    await expect(pay()).to.emit(c.escrow, "PayoutSettled");
    expect(await c.probe.observedTransfers()).to.equal(1n);
    expect(await c.probe.balanceOf(c.contrib.address)).to.equal(t.amount);
    expect(await c.escrow.usedAuthNonce(c.maint.address, approval.nonce)).to.equal(true);
    expect(await c.escrow.usedAttestationNonce(c.backend.address, att.nonce)).to.equal(true);
  });

  it("rolls back lazy expiry, refund status and authorization when the outbound refund transfer fails", async function () {
    const c = await loadFixture(withProbe);
    const t = await toClaimed(c, { token: c.probeAddress });
    const before = await c.escrow.getBounty(t.bountyId);
    await time.increaseTo(before.claimExpiry);
    const auth = await mkAuth(c.escrow, c.maint, "Refund", { bountyId: t.bountyId });
    await c.probe.watch(c.escrowAddr, t.bountyId, Status.Refunded, true);
    const send = () => c.escrow.connect(c.relayer).refund(t.bountyId, auth);
    await expect(send()).to.be.revertedWithCustomError(c.probe, "TransferRejected");
    const after = await c.escrow.getBounty(t.bountyId);
    expect(after.status).to.equal(Status.Claimed);
    expect(after.recipient).to.equal(before.recipient);
    expect(after.claimExpiry).to.equal(before.claimExpiry);
    expect(await c.escrow.effectiveStatus(t.bountyId)).to.equal(Status.Funded);
    expect(await c.escrow.usedAuthNonce(c.maint.address, auth.nonce)).to.equal(false);
    expect(await c.probe.balanceOf(c.escrowAddr)).to.equal(t.amount);

    await c.probe.watch(c.escrowAddr, t.bountyId, Status.Refunded, false);
    await expect(send()).to.emit(c.escrow, "ClaimExpired").and.to.emit(c.escrow, "BountyRefunded");
    expect(await c.probe.observedTransfers()).to.equal(1n);
  });

  it("does not burn a valid backend nonce when the subsequent maintainer approval fails", async function () {
    const c = await loadFixture(deploy);
    const t = await toSubmitted(c);
    const s = await settlementFor(c, t);
    const { att, approval } = await signSettlement(c, s, { approver: c.maint2 });
    await expect(c.escrow.connect(c.relayer).settle(s, att, approval))
      .to.be.revertedWithCustomError(c.escrow, "NotPayoutAuthority");
    expect(await c.escrow.usedAttestationNonce(c.backend.address, att.nonce)).to.equal(false);
    expect(await c.escrow.usedAuthNonce(c.maint2.address, approval.nonce)).to.equal(false);
    const authorized = await mkAuth(c.escrow, c.maint, "PayoutApproval", s);
    await expect(c.escrow.connect(c.relayer).settle(s, att, authorized)).to.emit(c.escrow, "PayoutSettled");
  });

  it("characterizes an authorization gap: distinct addresses can still share one controlling key", async function () {
    const c = await loadFixture(deploy);
    const t = await toSubmitted(c);
    // Owner assigns an ERC-1271 attester controlled by the existing maintainer EOA.
    const account = await (await ethers.getContractFactory("MockSmartAccount")).deploy(c.maint.address);
    const attester = await account.getAddress();
    expect(attester).not.to.equal(c.maint.address);
    await c.escrow.connect(c.repoOwner).setAttestationSigner(attester);
    const s = await settlementFor(c, t);
    // One private key produces both signatures, despite the intended separation of operators.
    const { att, approval } = await signSettlement(c, s, { backend: c.maint, approver: c.maint });
    await expect(c.escrow.connect(c.relayer).settle(s, att, approval)).to.emit(c.escrow, "PayoutSettled");
    expect(await c.token.balanceOf(c.contrib.address)).to.equal(t.amount);
  });
});
