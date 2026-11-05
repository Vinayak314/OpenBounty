const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { Status, deploy, fund, accept, submit, refund, settle, toClaimed, toSubmitted, settlementFor, signSettlement } =
  require("../fixtures");

describe("02 Integration: existing units, token and signatures", function () {
  it("moves the locked token from funder to claimant across fund, claim, registration and settlement", async function () {
    const c = await loadFixture(deploy);
    const before = await c.token.balanceOf(c.maint.address);
    const t = await fund(c);
    await accept(c, t);
    await submit(c, t);
    await settle(c, t);
    expect((await c.escrow.getBounty(t.bountyId)).status).to.equal(Status.Paid);
    expect(await c.token.balanceOf(c.maint.address)).to.equal(before - t.amount);
    expect(await c.token.balanceOf(c.contrib.address)).to.equal(t.amount);
    expect(await c.token.balanceOf(c.escrowAddr)).to.equal(0n);
  });

  it("leaves a second bounty fully collateralized when the first is refunded", async function () {
    const c = await loadFixture(deploy);
    const a = await fund(c);
    const b = await toClaimed(c);
    await refund(c, a);
    expect((await c.escrow.getBounty(b.bountyId)).status).to.equal(Status.Claimed);
    expect(await c.token.balanceOf(c.escrowAddr)).to.equal(b.amount);
    await submit(c, b);
    await settle(c, b);
    expect(await c.token.balanceOf(c.contrib.address)).to.equal(b.amount);
  });

  it("checks ERC-1271 approval and an independent backend signature in the same settlement", async function () {
    const c = await loadFixture(deploy);
    const account = await (await ethers.getContractFactory("MockSmartAccount")).deploy(c.controller.address);
    const accountAddr = await account.getAddress();
    await c.escrow.connect(c.repoOwner).setMaintainer(accountAddr, true);
    await c.escrow.connect(c.repoOwner).setSettlementWallet(accountAddr, true);
    const t = await toSubmitted(c);
    const s = await settlementFor(c, t);
    const forged = await signSettlement(c, s, { approver: accountAddr, approvalOpts: { signWith: c.outsider } });
    await expect(c.escrow.connect(c.relayer).settle(s, forged.att, forged.approval))
      .to.be.revertedWithCustomError(c.escrow, "InvalidSignature");
    const valid = await signSettlement(c, s, { approver: accountAddr, approvalOpts: { signWith: c.controller } });
    await expect(c.escrow.connect(c.relayer).settle(s, valid.att, valid.approval))
      .to.emit(c.escrow, "PayoutSettled");
  });
});
