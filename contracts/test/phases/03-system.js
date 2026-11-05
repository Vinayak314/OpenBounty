const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { loadFixture, time, setBalance } = require("@nomicfoundation/hardhat-network-helpers");
const { deploy, newTerms, accept, submit, refund, settlementFor, signSettlement, Status, HOUR } =
  require("../fixtures");
const { usdt, id } = require("../helpers");

const receiveTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};

describe("03 System: contract subsystem via its public ABI", function () {
  before(function () {
    // Local EVM control methods and mock minting are required; never run this suite on a live chain.
    expect(["hardhat", "localhost"]).to.include(network.name);
  });

  it("completes a relayed bounty with zero payer gas balance, stale approval rejection, and a payout receipt", async function () {
    const c = await loadFixture(deploy);
    const payer = c.maint2;
    await c.escrow.connect(c.repoOwner).setSettlementWallet(payer.address, true);
    await c.token.connect(payer).approve(c.escrowAddr, 0n);
    await setBalance(payer.address, 0n);
    const t = await newTerms(c, { amount: usdt(100) });
    const nonce = await c.escrow.hashTerms(t, payer.address);
    const validBefore = (await time.latest()) + HOUR;
    const signature = ethers.Signature.from(await payer.signTypedData(
      { name: "Tether USD", version: "1", chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: c.tokenAddr },
      receiveTypes,
      { from: payer.address, to: c.escrowAddr, value: t.amount, validAfter: 0, validBefore, nonce }
    ));
    const sponsorBefore = await ethers.provider.getBalance(c.relayer.address);
    await expect(c.escrow.connect(c.relayer).fundWithAuthorization(
      t, payer.address, 0, validBefore, signature.v, signature.r, signature.s
    )).to.emit(c.escrow, "BountyFunded");
    expect(await c.token.authorizationState(payer.address, nonce)).to.equal(true);
    await accept(c, t, c.contrib, { signer: payer });
    await submit(c, t);
    await expect(refund(c, t, { signer: payer })).to.be.revertedWithCustomError(c.escrow, "BadStatus");

    const revised = await settlementFor(c, t, { reviewedSha: id("fixed-head"), reportHash: id("fixed-review") });
    const previous = { ...revised, reviewedSha: id("incomplete-head"), reportHash: id("incomplete-review") };
    const mixed = await signSettlement(c, revised, { approver: payer, approvalFields: previous });
    await expect(c.escrow.connect(c.relayer).settle(revised, mixed.att, mixed.approval))
      .to.be.revertedWithCustomError(c.escrow, "InvalidSignature");

    const { att, approval } = await signSettlement(c, revised, { approver: payer });
    const receipt = await (await c.escrow.connect(c.relayer).settle(revised, att, approval)).wait();
    const event = receipt.logs.filter((log) => log.address === c.escrowAddr)
      .map((log) => c.escrow.interface.parseLog(log)).find((log) => log?.name === "PayoutSettled");
    expect(receipt.status).to.equal(1);
    expect(event.args.bountyId).to.equal(t.bountyId);
    expect(event.args.recipient).to.equal(c.contrib.address);
    expect(event.args.reviewedSha).to.equal(revised.reviewedSha);
    expect(event.args.amount).to.equal(t.amount);
    expect(event.args.approvedBy).to.equal(payer.address);
    expect(await c.token.balanceOf(c.contrib.address)).to.equal(t.amount);
    expect((await c.escrow.getBounty(t.bountyId)).status).to.equal(Status.Paid);
    expect(await ethers.provider.getBalance(payer.address)).to.equal(0n);
    expect(await ethers.provider.getBalance(c.relayer.address)).to.be.lt(sponsorBefore);
    await expect(c.escrow.connect(c.relayer).settle(revised, att, approval))
      .to.be.revertedWithCustomError(c.escrow, "BadStatus").withArgs(Status.Paid);
  });
});
