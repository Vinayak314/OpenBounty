// End-to-end payment flow: real contracts on a local Hardhat node, an in-memory MongoDB, stubbed GitHub, and
// the backend services exactly as the HTTP routes call them. Requires `npx hardhat compile` in ../contracts.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const { JsonRpcProvider, Wallet, ContractFactory, NonceManager, parseUnits } = require("ethers");
const { makePasskey, assertion } = require("../../contracts/test/webauthn");

const CONTRACTS = path.join(__dirname, "../../contracts");
const PORT = 8547;
const RPC = `http://127.0.0.1:${PORT}`;
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // deployer
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // sponsor
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // attestation signer
];
const artifact = (name) => JSON.parse(fs.readFileSync(path.join(CONTRACTS, `artifacts/contracts/${name === "MockUSDT" ? "mocks/" : ""}${name}.sol/${name}.json`), "utf8"));
const haveArtifacts = fs.existsSync(path.join(CONTRACTS, "artifacts/contracts/OpenBountyAccountFactory.sol"));

const gh = { pr: null };
function stubGithub() {
  const real = global.fetch;
  global.fetch = async (url, options) => {
    const href = String(url);
    if (!href.startsWith("https://api.github.com/")) return real(url, options);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (href.endsWith("/repos/acme/web/pulls/7") && gh.pr) return json(gh.pr);
    if (href.endsWith("/repos/acme/web/issues/12")) return json({ number: 12, title: "Double submit", body: "Clicking twice sends twice.", state: "open", html_url: "https://github.com/acme/web/issues/12", labels: [] });
    return json({ message: "Not Found" }, 404);
  };
}

async function waitForRpc(provider) {
  for (let i = 0; i < 60; i++) {
    try { await provider.getBlockNumber(); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error("Hardhat node did not start.");
}

test("passkey accounts fund, claim, submit and settle a bounty with sponsored gas", { skip: !haveArtifacts && "compile ../contracts first", timeout: 240000 }, async (t) => {
  const node = spawn("npx", ["hardhat", "node", "--port", String(PORT)], { cwd: CONTRACTS, stdio: "ignore" });
  t.after(() => node.kill());
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongo = await MongoMemoryServer.create();
  t.after(async () => { await mongoose.disconnect(); await mongo.stop(); });
  await mongoose.connect(mongo.getUri());

  const provider = new JsonRpcProvider(RPC, 31337, { staticNetwork: true });
  await waitForRpc(provider);
  const deployer = new NonceManager(new Wallet(KEYS[0], provider));
  const attester = new Wallet(KEYS[2]);
  const deploy = async (name, ...args) => {
    const a = artifact(name);
    const contract = await new ContractFactory(a.abi, a.bytecode, deployer).deploy(...args);
    await contract.waitForDeployment();
    return contract;
  };
  const factory = await deploy("OpenBountyAccountFactory");
  const usdt = await deploy("MockUSDT");

  // Passkeys: the owner (also maintainer and payout approver) and a contributor.
  const ownerKey = makePasskey();
  const contribKey = makePasskey();
  const ownerAccount = await factory.accountAddress(ownerKey.qx, ownerKey.qy);
  const escrow = await deploy("BountyEscrow", ownerAccount, attester.address, [await usdt.getAddress()]);

  Object.assign(process.env, {
    WHITECHAIN_RPC_URL: RPC, WHITECHAIN_CHAIN_ID: "31337", ESCROW_ADDRESS: await escrow.getAddress(),
    ACCOUNT_FACTORY_ADDRESS: await factory.getAddress(), USDT_ADDRESS: await usdt.getAddress(),
    SPONSOR_PRIVATE_KEY: KEYS[1], ATTESTATION_PRIVATE_KEY: KEYS[2], WEBAUTHN_RP_ID: "localhost",
    WEBAUTHN_ORIGINS: "http://localhost:5173", PAYMENTS_ENABLED: "true", INDEXER_POLL_MS: "100000",
  });
  stubGithub();

  const User = require("../models/User");
  const Project = require("../models/Project");
  const Bounty = require("../models/Bounty");
  const Review = require("../models/Review");
  const SponsoredTx = require("../models/SponsoredTx");
  const { ChainEvent } = require("../models/ChainEvent");
  const wallet = require("../services/chain/wallet");
  const svc = require("../services/bounties/service");
  const permissions = require("../services/bounties/permissions");
  const indexer = require("../services/chain/indexer");

  const owner = await User.create({ firebaseUid: "owner-uid", displayName: "Olive Owner", github: { username: "olive" } });
  const contrib = await User.create({ firebaseUid: "contrib-uid", displayName: "Cody Contributor", github: { username: "cody" } });

  async function setup(user, key) {
    const options = await wallet.registrationOptions(user);
    const challenge = `0x${Buffer.from(options.challenge, "base64url").toString("hex")}`;
    const fresh = await User.findById(user._id);
    const updated = await wallet.registerPasskey(fresh, { credentialId: "cred_" + "a".repeat(20), publicKey: key.spki, assertion: assertion(key, challenge) });
    await wallet.ensureDeployed(updated);
    return User.findById(user._id);
  }
  const ownerUser = await setup(owner, ownerKey);
  const contribUser = await setup(contrib, contribKey);
  assert.equal(ownerUser.wallet.address, ownerAccount.toLowerCase());
  assert.equal(await provider.getBalance(ownerAccount), 0n, "payer account holds no gas token");

  // Wrong passkey cannot register an account for a challenge.
  const project = await Project.create({
    name: "Acme web", slug: "acme-web", owner: owner._id, githubRepository: { owner: "acme", name: "web", fullName: "acme/web" },
  });
  await project.populate("owner", "firebaseUid displayName");

  async function sign(user, key, intent) {
    const digest = `0x${Buffer.from(intent.challenge, "base64url").toString("hex")}`;
    return wallet.submitIntent({ user: await User.findById(user._id), intentId: intent.intentId, assertion: assertion(key, digest) });
  }

  const overview = await permissions.paymentsOverview(project, "owner-uid");
  assert.equal(overview.escrow.canManageRoles, true);

  // Draft -> fund (approve + fund in one passkey approval).
  await usdt.connect(deployer).mint(ownerAccount, parseUnits("50", 6));
  const draft = await svc.createDraft({ project, uid: "owner-uid", name: "Olive Owner", input: {
    title: "Fix double submit", amount: "25", issueNumber: 12, submissionDeadline: new Date(Date.now() + 5 * 86400000).toISOString(),
    criteria: ["Ignore duplicate submits while pending", "Reset pending state after a failed request"],
  } });
  assert.equal(draft.issue.number, 12);
  const fundIntent = await svc.prepareFund({ project, uid: "owner-uid", number: draft.number });
  // A different passkey's assertion is rejected before anything is sent.
  await assert.rejects(sign(owner, contribKey, fundIntent), /not valid for this account/);
  const fundIntent2 = await svc.prepareFund({ project, uid: "owner-uid", number: draft.number });
  const funded = await sign(owner, ownerKey, fundIntent2);
  assert.equal(funded.status, "confirmed");
  assert.equal((await Bounty.findById(draft._id)).status, "funded");
  await assert.rejects(svc.updateDraft({ project, uid: "owner-uid", number: draft.number, input: { amount: "1" } }), /locked/);

  // Claim request -> owner accepts (binds recipient).
  await assert.rejects(svc.requestClaim({ project, uid: "owner-uid", number: draft.number }), /funded this bounty/);
  const requested = await svc.requestClaim({ project, uid: "contrib-uid", number: draft.number, message: "On it" });
  const requestId = String(requested.claimRequests[0]._id);
  await sign(owner, ownerKey, await svc.prepareAccept({ project, uid: "owner-uid", number: draft.number, requestId }));
  let bounty = await Bounty.findById(draft._id);
  assert.equal(bounty.status, "claimed");
  assert.equal(bounty.chain.recipient, contribUser.wallet.address);

  // Submission: PR author must be the claimant; backend attests and the sponsor relays.
  gh.pr = { number: 7, head: { sha: "ab".repeat(20) }, merged: false, state: "open", draft: false, user: { login: "mallory" },
    html_url: "https://github.com/acme/web/pull/7", title: "Fix", base: { repo: { full_name: "acme/web", private: false } } };
  await assert.rejects(svc.submitPullRequest({ project, uid: "contrib-uid", number: draft.number, prNumber: 7 }), /not by the claimant/);
  gh.pr.user.login = "cody";
  let queued = null;
  await svc.submitPullRequest({ project, uid: "contrib-uid", number: draft.number, prNumber: 7, queueReview: (args) => { queued = args; } });
  assert.equal(queued.prNumber, 7);
  bounty = await Bounty.findById(draft._id);
  assert.equal(bounty.status, "submitted");

  // Payout requires merge and a current 0G report for this bounty's criteria.
  await assert.rejects(svc.preparePayout({ project, uid: "owner-uid", number: draft.number }), /0G evidence report/);
  const reportHash = createHash("sha256").update("report").digest("hex");
  await Review.create({ project: project._id, bounty: bounty._id, prNumber: 7, headSha: "ab".repeat(20), criteriaHash: bounty.criteria.hash,
    criteriaVersion: 1, verdict: "ready_for_approval", requestId: "0g-req-123", model: "glm-5.2", reportHash, results: [] });
  await assert.rejects(svc.preparePayout({ project, uid: "owner-uid", number: draft.number }), /Merge the PR/);
  Object.assign(gh.pr, { merged: true, state: "closed", merge_commit_sha: "cd".repeat(20) });
  const payout = await svc.preparePayout({ project, uid: "owner-uid", number: draft.number });
  const paid = await sign(owner, ownerKey, payout);
  assert.equal(paid.status, "confirmed");
  bounty = await Bounty.findById(draft._id);
  assert.equal(bounty.status, "paid");
  assert.ok(bounty.chain.payoutTx);
  assert.equal(await usdt.balanceOf(contribUser.wallet.address), parseUnits("25", 6));
  assert.equal(await provider.getBalance(ownerAccount), 0n);
  assert.equal(await provider.getBalance(contribUser.wallet.address), 0n);

  // Double payout and refund-after-payment fail; re-indexing is idempotent.
  await assert.rejects(svc.preparePayout({ project, uid: "owner-uid", number: draft.number }), /registered submission/);
  await assert.rejects(svc.prepareRefund({ project, uid: "owner-uid", number: draft.number }), /refunded/);
  await indexer.poll(); // also picks up deployment-time role events that no relayed receipt carried
  const events = await ChainEvent.countDocuments();
  await indexer.poll();
  await indexer.poll();
  assert.equal(await ChainEvent.countDocuments(), events);
  assert.equal((await Bounty.findById(draft._id)).status, "paid");

  // A missed event is recovered: wipe the chain-derived state and let the indexer rebuild it from logs.
  await Bounty.updateOne({ _id: draft._id }, { $set: { status: "funded", "chain.lastBlock": 0, "chain.lastLogIndex": -1 } });
  await ChainEvent.deleteMany({});
  const { ChainCursor } = require("../models/ChainEvent");
  await ChainCursor.deleteMany({});
  await indexer.poll();
  assert.equal((await Bounty.findById(draft._id)).status, "paid");

  // Owner grants a co-owner maintainer + payout permissions on chain (one passkey approval).
  const coKey = makePasskey();
  const co = await User.create({ firebaseUid: "co-uid", displayName: "Cam Coowner", github: { username: "cam" } });
  const coUser = await setup(co, coKey);
  project.coOwners = [co._id];
  await project.save();
  await project.populate("coOwners", "firebaseUid displayName");
  await sign(owner, ownerKey, await permissions.prepareRoles({ project, uid: "owner-uid", targetUid: "co-uid", maintainer: true, settlement: true }));
  const escrowRead = new (require("ethers").Contract)(process.env.ESCROW_ADDRESS, ["function canAuthorizePayout(address) view returns (bool)"], provider);
  assert.equal(await escrowRead.canAuthorizePayout(coUser.wallet.address), true);
  await assert.rejects(permissions.prepareRoles({ project, uid: "co-uid", targetUid: "co-uid", maintainer: false }), /Only the project owner/);

  // Mutual cancellation: claimant consents with an ERC-1271 passkey signature, maintainer executes.
  const deadline = new Date(Date.now() + 5 * 86400000).toISOString();
  const second = await svc.createDraft({ project, uid: "owner-uid", name: "Olive", input: { title: "Second", amount: "10", submissionDeadline: deadline, criteria: ["Do it"] } });
  await sign(owner, ownerKey, await svc.prepareFund({ project, uid: "owner-uid", number: second.number }));
  const req2 = await svc.requestClaim({ project, uid: "contrib-uid", number: second.number });
  await sign(owner, ownerKey, await svc.prepareAccept({ project, uid: "owner-uid", number: second.number, requestId: String(req2.claimRequests[0]._id) }));
  await assert.rejects(svc.prepareCancel({ project, uid: "owner-uid", number: second.number }), /not agreed/);
  await assert.rejects(svc.prepareRefund({ project, uid: "owner-uid", number: second.number }), /without an active claim/);
  const consent = await sign(contrib, contribKey, await svc.prepareCancelConsent({ project, uid: "contrib-uid", number: second.number }));
  assert.equal(consent.status, "signed");
  await sign(co, coKey, await svc.prepareCancel({ project, uid: "co-uid", number: second.number }));
  assert.equal((await Bounty.findById(second._id)).status, "refunded");
  assert.equal((await Bounty.findById(second._id)).chain.refundReason, "mutual_cancellation");

  // Plain refund of an unclaimed bounty returns funds to the funder.
  const third = await svc.createDraft({ project, uid: "owner-uid", name: "Olive", input: { title: "Third", amount: "5", submissionDeadline: deadline, criteria: ["Do it"] } });
  await sign(owner, ownerKey, await svc.prepareFund({ project, uid: "owner-uid", number: third.number }));
  await sign(owner, ownerKey, await svc.prepareRefund({ project, uid: "owner-uid", number: third.number }));
  assert.equal((await Bounty.findById(third._id)).status, "refunded");
  assert.equal(await usdt.balanceOf(ownerAccount), parseUnits("25", 6)); // 50 - 25 paid; 10 and 5 came back

  // Every sponsored transaction is recorded for limits and budget.
  const kinds = (await SponsoredTx.find().lean()).map((tx) => tx.kind);
  for (const kind of ["create_account", "fund", "accept_claim", "register_submission", "settle"]) assert.ok(kinds.includes(kind), kind);
  assert.ok((await SponsoredTx.find().lean()).every((tx) => tx.status === "confirmed"));
});
