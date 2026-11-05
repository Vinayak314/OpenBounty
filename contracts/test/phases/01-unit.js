const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { deploy, newTerms } = require("../fixtures");
const { id, domainFor } = require("../helpers");

describe("01 Unit: individual escrow operations", function () {
  it("matches an independently encoded funding commitment and binds the repository reference", async function () {
    const { escrow, maint, tokenAddr } = await loadFixture(deploy);
    const terms = await newTerms({ tokenAddr });
    const types = {
      FundingTerms: [
        { name: "bountyId", type: "bytes32" },
        { name: "funder", type: "address" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "criteriaHash", type: "bytes32" },
        { name: "repoRef", type: "bytes32" },
        { name: "submissionDeadline", type: "uint64" },
      ],
    };
    const expected = ethers.TypedDataEncoder.hash(await domainFor(escrow), types, {
      ...terms, funder: maint.address,
    });
    expect(await escrow.hashTerms(terms, maint.address)).to.equal(expected);
    expect(await escrow.hashTerms({ ...terms, repoRef: id("repo#2") }, maint.address)).not.to.equal(expected);
  });

  it("grants and revokes effective payout permission independently of maintainer status", async function () {
    const { escrow, repoOwner, maint2 } = await loadFixture(deploy);
    expect(await escrow.hasMaintainerRole(maint2.address)).to.equal(true);
    expect(await escrow.canAuthorizePayout(maint2.address)).to.equal(false);
    await escrow.connect(repoOwner).setSettlementWallet(maint2.address, true);
    expect(await escrow.canAuthorizePayout(maint2.address)).to.equal(true);
    await escrow.connect(repoOwner).setMaintainer(maint2.address, false);
    expect(await escrow.isSettlementWallet(maint2.address)).to.equal(true);
    expect(await escrow.canAuthorizePayout(maint2.address)).to.equal(false);
  });

  it("invalidates a nonce for its caller without invalidating the same nonce for another signer", async function () {
    const { escrow, maint, maint2 } = await loadFixture(deploy);
    const nonce = 42n;
    await expect(escrow.connect(maint).invalidateNonce(nonce))
      .to.emit(escrow, "NonceInvalidated").withArgs(maint.address, nonce);
    expect(await escrow.usedAuthNonce(maint.address, nonce)).to.equal(true);
    expect(await escrow.usedAuthNonce(maint2.address, nonce)).to.equal(false);
  });
});
