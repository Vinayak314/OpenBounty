const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");
const { makePasskey, assertion } = require("./webauthn");
const { usdt, id } = require("./helpers");

// These tests drive the contracts with the backend's own modules, so a divergence between what the
// server builds/signs and what the contracts verify fails here.
const { executeDigest, escrowDigest, signAttestation } = require("../../server/services/chain/eip712");
const { verifyAssertion, encodeContractSignature, publicKeyFromSpki } = require("../../server/services/chain/webauthn");
const enc = require("../../server/services/chain/encoding");
const { assertAllowedAccountCalls } = require("../../server/services/chain/policy");

const CHAIN_ID = 31337;
const RP = { rpId: "localhost", origins: ["http://localhost:5173"] };

async function deployAll() {
  const [deployer, backend, relayer, outsider] = await ethers.getSigners();
  const factory = await (await ethers.getContractFactory("OpenBountyAccountFactory")).deploy();
  const token = await (await ethers.getContractFactory("MockUSDT")).deploy();
  const keys = { owner: makePasskey(), maint: makePasskey(), contrib: makePasskey(), stranger: makePasskey() };
  const addr = {};
  for (const [name, key] of Object.entries(keys)) {
    addr[name] = await factory.accountAddress(key.qx, key.qy);
    await factory.connect(relayer).createAccount(key.qx, key.qy);
  }
  const escrow = await (await ethers.getContractFactory("BountyEscrow"))
    .deploy(addr.owner, backend.address, [await token.getAddress()]);
  const account = (name) => ethers.getContractAt("OpenBountyAccount", addr[name]);
  return { deployer, backend, relayer, outsider, factory, token, escrow, keys, addr, account,
    escrowAddr: await escrow.getAddress(), tokenAddr: await token.getAddress() };
}

/** Builds, passkey-signs and relays one account batch the way the backend does. */
async function run(ctx, name, calls, { key = ctx.keys[name], flags, deadlineIn = 600, tamper } = {}) {
  const account = await ctx.account(name);
  const nonce = await account.nonce();
  const deadline = (await time.latest()) + deadlineIn;
  const digest = executeDigest({ chainId: CHAIN_ID, account: ctx.addr[name], calls, nonce, deadline });
  expect(digest).to.equal(await account.executeDigest(calls, nonce, deadline));
  const signed = assertion(key, digest, { flags });
  const parts = flags === undefined && key === ctx.keys[name]
    ? verifyAssertion({ assertion: signed, challenge: digest, qx: key.qx, qy: key.qy, ...RP })
    : { authenticatorData: Buffer.from(signed.authenticatorData, "base64url"),
      clientDataJSON: Buffer.from(signed.clientDataJSON, "base64url").toString("utf8"),
      signature: Buffer.from(signed.signature, "base64url") };
  const signature = encodeContractSignature(parts);
  return account.connect(ctx.relayer).execute(tamper ? tamper(calls) : calls, deadline, signature);
}

const call = (contract, fn, args) => ({ target: contract.target, value: 0n, data: contract.interface.encodeFunctionData(fn, args) });
const selfAuth = (signer, deadline) => ({ signer, nonce: enc.randomNonce(), deadline, signature: "0x" });

describe("OpenBountyAccount (passkey) + sponsored escrow flow", function () {
  let ctx;
  beforeEach(async function () { ctx = await deployAll(); });

  it("factory: deterministic, idempotent, rejects invalid keys", async function () {
    const key = makePasskey();
    const predicted = await ctx.factory.accountAddress(key.qx, key.qy);
    await expect(ctx.factory.createAccount(key.qx, key.qy)).to.emit(ctx.factory, "AccountCreated").withArgs(predicted, key.qx, key.qy);
    await expect(ctx.factory.createAccount(key.qx, key.qy)).not.to.emit(ctx.factory, "AccountCreated");
    const acct = await ethers.getContractAt("OpenBountyAccount", predicted);
    expect(await acct.qx()).to.equal(key.qx);
    await expect(ctx.factory.createAccount(id("x"), id("y"))).to.be.revertedWithCustomError(ctx.factory, "InvalidPublicKey");
    expect(publicKeyFromSpki(key.spki)).to.deep.equal({ qx: key.qx, qy: key.qy });
  });

  it("full lifecycle with zero-gas passkey accounts, server attestations and a relayer", async function () {
    const { escrow, token, addr, backend } = ctx;
    const now = await time.latest();
    // Owner account grants maintainer + settlement roles (one passkey prompt, sponsor pays gas).
    await run(ctx, "owner", [
      call(escrow, "setMaintainer", [addr.maint, true]), call(escrow, "setSettlementWallet", [addr.maint, true]),
    ]);
    expect(await escrow.canAuthorizePayout(addr.maint)).to.equal(true);
    expect(await ethers.provider.getBalance(addr.maint)).to.equal(0n);

    // Maintainer funds: approve + fund in one batch.
    await token.mint(addr.maint, usdt(100));
    const bountyId = enc.bountyIdFor("6650f0c0ffee000000000001");
    const criteria = ["Ignore duplicate submits while pending", "Reset pending after a failure"];
    const terms = {
      bountyId, token: ctx.tokenAddr, amount: enc.parseUsdt("25.5"), criteriaHash: enc.criteriaHashFor(criteria),
      repoRef: enc.repoRefFor("acme/web", 12), submissionDeadline: now + 7 * 86400,
    };
    const fundCalls = [call(token, "approve", [ctx.escrowAddr, terms.amount]), call(escrow, "fund", [terms])];
    assertAllowedAccountCalls(fundCalls, { escrow: ctx.escrowAddr, token: ctx.tokenAddr, maxAmount: usdt(1000) });
    await expect(run(ctx, "maint", fundCalls)).to.emit(escrow, "BountyFunded");
    expect((await escrow.getBounty(bountyId)).funder).to.equal(addr.maint);

    // Accept claim for the contributor account.
    const deadline = (await time.latest()) + 3600;
    await expect(run(ctx, "maint", [call(escrow, "acceptClaim", [bountyId, addr.contrib, selfAuth(addr.maint, deadline)])]))
      .to.emit(escrow, "ClaimAccepted");

    // Backend attests the submission; anyone relays it.
    const headSha = "ab".repeat(20);
    const submissionRef = enc.submissionRefFor("acme/web", 7, headSha);
    const subAtt = await signAttestation({
      signer: backend, chainId: CHAIN_ID, escrow: ctx.escrowAddr, type: "SubmissionAttestation", now: await time.latest(),
      value: { bountyId, claimVersion: 1, recipient: addr.contrib, submissionRef },
    });
    await escrow.connect(ctx.relayer).registerSubmission(bountyId, 1, submissionRef, subAtt);

    // Settlement: backend attestation + maintainer passkey approval (self-auth inside execute).
    const settlement = {
      bountyId, claimVersion: 1, recipient: addr.contrib, amount: terms.amount, criteriaHash: terms.criteriaHash,
      reviewedSha: enc.shaToBytes32(headSha), mergeRef: enc.shaToBytes32("cd".repeat(20)),
      reportHash: enc.reportHashToBytes32("ef".repeat(32)),
    };
    const setAtt = await signAttestation({
      signer: backend, chainId: CHAIN_ID, escrow: ctx.escrowAddr, type: "SettlementAttestation", value: settlement, now: await time.latest(),
    });
    const tx = run(ctx, "maint", [call(escrow, "settle", [settlement, setAtt, selfAuth(addr.maint, (await time.latest()) + 3600)])]);
    await expect(tx).to.emit(escrow, "PayoutSettled");
    expect(await token.balanceOf(addr.contrib)).to.equal(terms.amount);
    expect(enc.formatUsdt(await token.balanceOf(addr.contrib))).to.equal("25.5");
    // Replaying the same settlement fails.
    await expect(run(ctx, "maint", [call(escrow, "settle", [settlement, setAtt, selfAuth(addr.maint, (await time.latest()) + 3600)])]))
      .to.be.revertedWithCustomError(await ctx.account("maint"), "CallFailed");
  });

  it("claimant consents to cancellation with an ERC-1271 passkey signature", async function () {
    const { escrow, token, addr } = ctx;
    await run(ctx, "owner", [call(escrow, "setMaintainer", [addr.maint, true])]);
    await token.mint(addr.maint, usdt(10));
    const bountyId = enc.bountyIdFor("cancel-1");
    const terms = { bountyId, token: ctx.tokenAddr, amount: usdt(10), criteriaHash: id("c"), repoRef: id("r"),
      submissionDeadline: (await time.latest()) + 86400 };
    await run(ctx, "maint", [call(token, "approve", [ctx.escrowAddr, terms.amount]), call(escrow, "fund", [terms])]);
    await run(ctx, "maint", [call(escrow, "acceptClaim", [bountyId, addr.contrib, selfAuth(addr.maint, (await time.latest()) + 3600)])]);

    const consent = { bountyId, claimVersion: 1, nonce: enc.randomNonce(), deadline: (await time.latest()) + 3600 };
    const digest = escrowDigest({ chainId: CHAIN_ID, escrow: ctx.escrowAddr, type: "CancelByAgreement", value: consent });
    const parts = verifyAssertion({ assertion: assertion(ctx.keys.contrib, digest), challenge: digest,
      qx: ctx.keys.contrib.qx, qy: ctx.keys.contrib.qy, ...RP });
    const claimantAuth = { signer: addr.contrib, nonce: consent.nonce, deadline: consent.deadline, signature: encodeContractSignature(parts) };
    expect(await (await ctx.account("contrib")).isValidSignature(digest, claimantAuth.signature)).to.equal("0x1626ba7e");

    await expect(run(ctx, "maint", [call(escrow, "cancelByAgreement",
      [bountyId, 1, selfAuth(addr.maint, (await time.latest()) + 3600), claimantAuth])])).to.emit(escrow, "BountyRefunded");
    expect(await token.balanceOf(addr.maint)).to.equal(usdt(10));
  });

  it("rejects wrong keys, tampered calls, replays, missing user verification and bad deadlines", async function () {
    const { escrow, addr } = ctx;
    const calls = [call(escrow, "setMaintainer", [addr.maint, true])];
    const acct = await ctx.account("owner");
    await expect(run(ctx, "owner", calls, { key: ctx.keys.stranger })).to.be.revertedWithCustomError(acct, "InvalidSignature");
    await expect(run(ctx, "owner", calls, { tamper: () => [call(escrow, "setMaintainer", [addr.contrib, true])] }))
      .to.be.revertedWithCustomError(acct, "InvalidSignature");
    await expect(run(ctx, "owner", calls, { flags: 0x01 })).to.be.revertedWithCustomError(acct, "InvalidSignature");
    await expect(run(ctx, "owner", calls, { deadlineIn: 7200 })).to.be.revertedWithCustomError(acct, "ExecutionTtlTooLong");
    await expect(run(ctx, "owner", [], {})).to.be.revertedWithCustomError(acct, "EmptyBatch");

    // Replay: the same signature cannot run twice because the nonce is inside the digest.
    const nonce = await acct.nonce();
    const deadline = (await time.latest()) + 600;
    const digest = executeDigest({ chainId: CHAIN_ID, account: addr.owner, calls, nonce, deadline });
    const parts = verifyAssertion({ assertion: assertion(ctx.keys.owner, digest), challenge: digest, qx: ctx.keys.owner.qx, qy: ctx.keys.owner.qy, ...RP });
    const sig = encodeContractSignature(parts);
    await acct.connect(ctx.relayer).execute(calls, deadline, sig);
    await expect(acct.connect(ctx.relayer).execute(calls, deadline, sig)).to.be.revertedWithCustomError(acct, "InvalidSignature");
    // A failing inner call reverts the whole batch with the index.
    await expect(run(ctx, "maint", calls)).to.be.revertedWithCustomError(acct, "CallFailed");
  });

  it("server-side checks reject foreign challenges, origins and off-policy calls", async function () {
    const key = ctx.keys.owner;
    const digest = id("intent");
    const signed = assertion(key, digest);
    expect(() => verifyAssertion({ assertion: signed, challenge: id("other"), qx: key.qx, qy: key.qy, ...RP })).to.throw(/different request/);
    expect(() => verifyAssertion({ assertion: assertion(key, digest, { origin: "https://evil.test" }), challenge: digest, qx: key.qx, qy: key.qy, ...RP })).to.throw(/unexpected site/);
    expect(() => verifyAssertion({ assertion: assertion(key, digest, { flags: 0x01 }), challenge: digest, qx: key.qx, qy: key.qy, ...RP })).to.throw(/PIN or biometrics/);
    expect(() => verifyAssertion({ assertion: signed, challenge: digest, qx: ctx.keys.maint.qx, qy: ctx.keys.maint.qy, ...RP })).to.throw(/not valid/);
    const cfg = { escrow: ctx.escrowAddr, token: ctx.tokenAddr, maxAmount: usdt(100) };
    expect(() => assertAllowedAccountCalls([call(ctx.token, "approve", [ctx.addr.contrib, 1n])], cfg)).to.throw(/name the escrow/);
    expect(() => assertAllowedAccountCalls([call(ctx.token, "approve", [ctx.escrowAddr, usdt(101)])], cfg)).to.throw(/limit/);
    expect(() => assertAllowedAccountCalls([{ target: ctx.addr.contrib, value: 0n, data: "0x" }], cfg)).to.throw(/not sponsored/);
    expect(() => assertAllowedAccountCalls([{ ...call(ctx.escrow, "setMaintainer", [ctx.addr.maint, true]), value: 1n }], cfg)).to.throw(/gas token/);
  });
});
