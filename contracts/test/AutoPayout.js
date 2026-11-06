const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { usdt } = require("./helpers");
const { Status, deploy, toSubmitted, settle } = require("./fixtures");

// Automated payout agent: a dedicated key that can authorize `settle` only, up to a cap, and still needs the
// separate backend attestation. These tests pin down that it can do nothing else.
describe("automated payout agent", function () {
  async function setup() {
    const ctx = await deploy();
    const agent = ethers.Wallet.createRandom().connect(ethers.provider);
    ctx.agent = agent;
    await ctx.escrow.connect(ctx.repoOwner).setAutoPayoutAgent(agent.address, usdt(1000));
    return ctx;
  }

  it("only the owner registers an agent, and the agent must be a fresh key", async function () {
    const ctx = await loadFixture(setup);
    const { escrow } = ctx;
    await expect(escrow.connect(ctx.outsider).setAutoPayoutAgent(ctx.outsider.address, usdt(1)))
      .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    await expect(escrow.connect(ctx.repoOwner).setAutoPayoutAgent(ethers.ZeroAddress, usdt(1)))
      .to.be.revertedWithCustomError(escrow, "ZeroAddress");
    for (const bad of [ctx.repoOwner, ctx.maint, ctx.backend]) {
      await expect(escrow.connect(ctx.repoOwner).setAutoPayoutAgent(bad.address, usdt(1)))
        .to.be.revertedWithCustomError(escrow, "InvalidAutoPayoutAgent").withArgs(bad.address);
    }
    await expect(escrow.connect(ctx.repoOwner).setAutoPayoutAgent(ctx.agent.address, usdt(250)))
      .to.emit(escrow, "AutoPayoutAgentUpdated").withArgs(ctx.agent.address, usdt(250));
    expect(await escrow.canAutoPay(ctx.agent.address, usdt(250))).to.equal(true);
    expect(await escrow.canAutoPay(ctx.agent.address, usdt(251))).to.equal(false);
  });

  it("pays the bound recipient once when the agent and the backend both sign", async function () {
    const ctx = await setup();
    const t = await toSubmitted(ctx);
    const before = await ctx.token.balanceOf(ctx.contrib.address);
    await expect(settle(ctx, t, { approver: ctx.agent }))
      .to.emit(ctx.escrow, "PayoutSettled");
    expect(await ctx.token.balanceOf(ctx.contrib.address)).to.equal(before + t.amount);
    expect((await ctx.escrow.getBounty(t.bountyId)).status).to.equal(Status.Paid);
    await expect(settle(ctx, t, { approver: ctx.agent }))
      .to.be.revertedWithCustomError(ctx.escrow, "BadStatus").withArgs(Status.Paid);
  });

  it("rejects a payout above the agent's cap", async function () {
    const ctx = await setup();
    const t = await toSubmitted(ctx, { amount: usdt(1001) });
    await expect(settle(ctx, t, { approver: ctx.agent }))
      .to.be.revertedWithCustomError(ctx.escrow, "AutoPayoutCapExceeded").withArgs(usdt(1001), usdt(1000));
  });

  it("still requires the backend attestation: the agent alone cannot pay", async function () {
    const ctx = await setup();
    const t = await toSubmitted(ctx);
    // The attestation is signed by the agent instead of the registered backend key.
    await expect(settle(ctx, t, { approver: ctx.agent, backend: ctx.agent }))
      .to.be.revertedWithCustomError(ctx.escrow, "InvalidSignature");
  });

  it("cannot pay anyone but the bound recipient or alter the facts", async function () {
    const ctx = await setup();
    const t = await toSubmitted(ctx);
    await expect(settle(ctx, t, { approver: ctx.agent, overrides: { recipient: ctx.outsider.address } }))
      .to.be.revertedWithCustomError(ctx.escrow, "SettlementMismatch");
    await expect(settle(ctx, t, { approver: ctx.agent, overrides: { amount: usdt(1) } }))
      .to.be.revertedWithCustomError(ctx.escrow, "SettlementMismatch");
  });

  it("holds no other authority: no funding, refunds, claims or role changes", async function () {
    const ctx = await setup();
    const { escrow, agent } = ctx;
    expect(await escrow.hasMaintainerRole(agent.address)).to.equal(false);
    expect(await escrow.canAuthorizePayout(agent.address)).to.equal(false);
    await ctx.relayer.sendTransaction({ to: agent.address, value: ethers.parseEther("1") });
    const terms = {
      bountyId: ethers.id("agent-bounty"), token: ctx.tokenAddr, amount: usdt(5), criteriaHash: ethers.id("c"),
      repoRef: ethers.id("r"), submissionDeadline: (await ethers.provider.getBlock("latest")).timestamp + 86400,
    };
    await expect(escrow.connect(agent).fund(terms)).to.be.revertedWithCustomError(escrow, "NotMaintainer");
    await expect(escrow.connect(agent).setMaintainer(agent.address, true))
      .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
    await expect(escrow.connect(agent).setAutoPayoutAgent(agent.address, usdt(1e6)))
      .to.be.revertedWithCustomError(escrow, "OwnableUnauthorizedAccount");
  });

  it("an agent that later gains a role stops being able to approve payouts, and removal works", async function () {
    const ctx = await setup();
    const t = await toSubmitted(ctx);
    await ctx.escrow.connect(ctx.repoOwner).setMaintainer(ctx.agent.address, true);
    await expect(settle(ctx, t, { approver: ctx.agent }))
      .to.be.revertedWithCustomError(ctx.escrow, "InvalidAutoPayoutAgent");
    await ctx.escrow.connect(ctx.repoOwner).setMaintainer(ctx.agent.address, false);
    await ctx.escrow.connect(ctx.repoOwner).setAutoPayoutAgent(ctx.agent.address, 0);
    await expect(settle(ctx, t, { approver: ctx.agent }))
      .to.be.revertedWithCustomError(ctx.escrow, "NotPayoutAuthority");
  });

  it("rotating the attestation signer onto the agent cannot let one key satisfy both", async function () {
    const ctx = await setup();
    const t = await toSubmitted(ctx);
    await ctx.escrow.connect(ctx.repoOwner).setAttestationSigner(ctx.agent.address);
    await expect(settle(ctx, t, { approver: ctx.agent, backend: ctx.agent }))
      .to.be.revertedWithCustomError(ctx.escrow, "PartiesNotDistinct");
  });
});
