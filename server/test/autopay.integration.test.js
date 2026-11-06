// Automatic payout end to end: real contracts on a local Hardhat node, an in-memory MongoDB and a stubbed GitHub.
// Requires `npx hardhat compile` in ../contracts (done on demand, as in the other payment test).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const mongoose = require("mongoose");
const { JsonRpcProvider, Wallet, ContractFactory, NonceManager, parseUnits } = require("ethers");
const { makePasskey, assertion } = require("../../contracts/test/webauthn");

const CONTRACTS = path.join(__dirname, "../../contracts");
const PORT = 8548;
const RPC = `http://127.0.0.1:${PORT}`;
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // deployer
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // sponsor
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // attestation signer
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // automatic payout agent
];
const artifact = (name) => JSON.parse(fs.readFileSync(path.join(CONTRACTS, `artifacts/contracts/${name === "MockUSDT" ? "mocks/" : ""}${name}.sol/${name}.json`), "utf8"));
// The artifacts must include setAutoPayoutAgent: recompile whenever they are missing or older than the source.
const source = path.join(CONTRACTS, "contracts/BountyEscrow.sol");
const built = path.join(CONTRACTS, "artifacts/contracts/BountyEscrow.sol/BountyEscrow.json");
if (!fs.existsSync(built) || fs.statSync(built).mtimeMs < fs.statSync(source).mtimeMs) {
  require("node:child_process").execSync("npx hardhat compile", { cwd: CONTRACTS, stdio: "ignore" });
}

const gh = { pr: null };
function stubGithub() {
  const real = global.fetch;
  global.fetch = async (url, options) => {
    const href = String(url);
    if (!href.startsWith("https://api.github.com/")) return real(url, options);
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    if (gh.pr && href.endsWith(`/repos/acme/web/pulls/${gh.pr.number}`)) return json(gh.pr);
    if (href.endsWith("/repos/acme/web/issues/12")) return json({ number: 12, title: "Double submit", body: "x", state: "open", html_url: "https://github.com/acme/web/issues/12", labels: [] });
    return json({ message: "Not Found" }, 404);
  };
}

async function waitForRpc(provider) {
  for (let i = 0; i < 60; i++) {
    try { await provider.getBlockNumber(); return; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }
  throw new Error("Hardhat node did not start.");
}

test("a merged, approved PR pays automatically; anything unusual stays manual", { timeout: 240000 }, async (t) => {
  // On Windows npx is a .cmd shim, so it needs a shell, and killing the shell would orphan the node: use taskkill /T.
  const win = process.platform === "win32";
  const node = win
    ? spawn("cmd", ["/c", "npx", "hardhat", "node", "--port", String(PORT)], { cwd: CONTRACTS, stdio: "ignore" })
    : spawn("npx", ["hardhat", "node", "--port", String(PORT)], { cwd: CONTRACTS, stdio: "ignore" });
  t.after(() => { if (win) spawnSync("taskkill", ["/pid", String(node.pid), "/T", "/F"]); else node.kill(); });
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongo = await MongoMemoryServer.create();
  t.after(async () => { await mongoose.disconnect(); await mongo.stop(); });
  await mongoose.connect(mongo.getUri());

  const provider = new JsonRpcProvider(RPC, 31337, { staticNetwork: true });
  await waitForRpc(provider);
  const deployer = new NonceManager(new Wallet(KEYS[0], provider));
  const attester = new Wallet(KEYS[2]);
  const agent = new Wallet(KEYS[3]);
  const deploy = async (name, ...args) => {
    const a = artifact(name);
    const contract = await new ContractFactory(a.abi, a.bytecode, deployer).deploy(...args);
    await contract.waitForDeployment();
    return contract;
  };
  const factory = await deploy("OpenBountyAccountFactory");
  const usdt = await deploy("MockUSDT");
  const ownerKey = makePasskey();
  const contribKey = makePasskey();
  const ownerAccount = await factory.accountAddress(ownerKey.qx, ownerKey.qy);
  const escrow = await deploy("BountyEscrow", ownerAccount, attester.address, [await usdt.getAddress()]);

  Object.assign(process.env, {
    WHITECHAIN_RPC_URL: RPC, WHITECHAIN_CHAIN_ID: "31337", ESCROW_ADDRESS: await escrow.getAddress(),
    ACCOUNT_FACTORY_ADDRESS: await factory.getAddress(), USDT_ADDRESS: await usdt.getAddress(),
    SPONSOR_PRIVATE_KEY: KEYS[1], ATTESTATION_PRIVATE_KEY: KEYS[2], AUTOPAY_PRIVATE_KEY: KEYS[3], WEBAUTHN_RP_ID: "localhost",
    WEBAUTHN_ORIGINS: "http://localhost:5173", PAYMENTS_ENABLED: "true", INDEXER_POLL_MS: "100000", INDEXER_CONFIRMATIONS: "0",
  });
  stubGithub();

  const User = require("../models/User");
  const Project = require("../models/Project");
  const Bounty = require("../models/Bounty");
  const Review = require("../models/Review");
  const SponsoredTx = require("../models/SponsoredTx");
  const wallet = require("../services/chain/wallet");
  const svc = require("../services/bounties/service");
  const permissions = require("../services/bounties/permissions");
  const autopay = require("../services/bounties/autopay");

  const owner = await User.create({ firebaseUid: "owner-uid", displayName: "Olive Owner", github: { id: "1001", username: "olive" } });
  const contrib = await User.create({ firebaseUid: "contrib-uid", displayName: "Cody Contributor", github: { id: "1002", username: "cody" } });
  async function setup(user, key) {
    const options = await wallet.registrationOptions(user);
    const challenge = `0x${Buffer.from(options.challenge, "base64url").toString("hex")}`;
    const fresh = await User.findById(user._id);
    const updated = await wallet.registerPasskey(fresh, { credentialId: "cred_" + "a".repeat(20), publicKey: key.spki, assertion: assertion(key, challenge) });
    await wallet.ensureDeployed(updated);
    return User.findById(user._id);
  }
  await setup(owner, ownerKey);
  const contribUser = await setup(contrib, contribKey);
  const project = await Project.create({
    name: "Acme web", slug: "acme-web", owner: owner._id, githubRepository: { owner: "acme", name: "web", fullName: "acme/web" },
  });
  await project.populate("owner", "firebaseUid displayName");
  const sign = async (user, key, intent) => {
    const digest = `0x${Buffer.from(intent.challenge, "base64url").toString("hex")}`;
    return wallet.submitIntent({ user: await User.findById(user._id), intentId: intent.intentId, assertion: assertion(key, digest) });
  };
  const deadline = new Date(Date.now() + 5 * 86400000).toISOString();
  await usdt.connect(deployer).mint(ownerAccount, parseUnits("200", 6));

  // A funded, claimed, submitted bounty with a current report; returns { bounty, review }.
  let prSequence = 0;
  async function toSubmitted(title, amount) {
    const draft = await svc.createDraft({ project, uid: "owner-uid", name: "Olive", input: { title, amount, submissionDeadline: deadline, criteria: ["Do the thing"] } });
    await sign(owner, ownerKey, await svc.prepareFund({ project, uid: "owner-uid", number: draft.number }));
    const requested = await svc.requestClaim({ project, uid: "contrib-uid", number: draft.number });
    await sign(owner, ownerKey, await svc.prepareAccept({ project, uid: "owner-uid", number: draft.number, requestId: String(requested.claimRequests[0]._id) }));
    prSequence += 1;
    const number = 6 + prSequence; // one PR backs at most one bounty
    gh.pr = { number, head: { sha: String(prSequence).padStart(2, "0").repeat(20) }, merged: false, state: "open", draft: false, user: { login: "cody", id: 1002 },
      html_url: `https://github.com/acme/web/pull/${number}`, title: "Fix", base: { repo: { full_name: "acme/web", private: false } } };
    await svc.submitPullRequest({ project, uid: "contrib-uid", number: draft.number, prNumber: number, queueReview: () => {} });
    return Bounty.findById(draft._id);
  }
  const addReview = (bounty, verdict = "ready_for_approval") => Review.create({
    project: project._id, bounty: bounty._id, prNumber: gh.pr.number, headSha: gh.pr.head.sha, criteriaHash: bounty.criteria.hash, criteriaVersion: 1,
    verdict, requestId: "0g-req-" + verdict, model: "glm-5.2", reportHash: createHash("sha256").update(verdict + gh.pr.head.sha).digest("hex"), results: [],
  });
  const merge = () => Object.assign(gh.pr, { merged: true, state: "closed", merge_commit_sha: "cd".repeat(20) });

  // --- The owner must register the agent first; until then a maintainer cannot turn automation on. ---
  const first = await toSubmitted("Fix double submit", "25");
  await assert.rejects(autopay.setAutoPay({ project, uid: "owner-uid", name: "Olive", number: first.number, enabled: true }), /not registered/);
  await assert.rejects(autopay.setAutoPay({ project, uid: "contrib-uid", name: "Cody", number: first.number, enabled: true }), /Only the project owner/);
  await assert.rejects(permissions.prepareAutoPayAgent({ project, uid: "contrib-uid", maxUsdt: "100" }), /Only the project owner/);
  await sign(owner, ownerKey, await permissions.prepareAutoPayAgent({ project, uid: "owner-uid", maxUsdt: "100" }));
  assert.equal(await escrow.autoPayoutCap(agent.address), parseUnits("100", 6));
  const overview = await permissions.paymentsOverview(project, "owner-uid");
  assert.equal(overview.autoPay.enabled, true);
  assert.equal(overview.autoPay.capDisplay, "100.0");

  // Enabling starts an attempt in the background (like a webhook would); wait for it to settle before asserting.
  const idle = async (id) => {
    for (let i = 0; i < 100; i++) {
      if ((await Bounty.findById(id)).autoPay.state !== "processing") return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("The automatic payout attempt did not finish.");
  };

  // --- Waiting: opted in, but not merged and no report yet. Nothing is paid. ---
  await autopay.setAutoPay({ project, uid: "owner-uid", name: "Olive", number: first.number, enabled: true });
  await idle(first._id);
  await autopay.tryAutoPayout({ projectId: project._id, bountyId: first._id });
  let b = await Bounty.findById(first._id);
  assert.equal(b.status, "submitted");
  assert.equal(b.autoPay.state, "waiting");

  // --- A report that does not recommend approval is never paid automatically. ---
  await addReview(b, "needs_maintainer");
  merge();
  assert.equal((await autopay.tryAutoPayout({ projectId: project._id, bountyId: first._id })).status, "blocked");
  b = await Bounty.findById(first._id);
  assert.equal(b.status, "submitted");
  assert.match(b.autoPay.reason, /needs maintainer/);
  assert.equal(await usdt.balanceOf(contribUser.wallet.address), 0n);

  // --- A current recommendation pays, once, with no passkey prompt and no gas on the payer side. ---
  await Review.updateMany({ bounty: b._id }, { $set: { status: "stale" } });
  await addReview(b, "ready_for_approval");
  const result = await autopay.tryAutoPayout({ projectId: project._id, bountyId: first._id });
  assert.equal(result.status, "paid", result.reason);
  b = await Bounty.findById(first._id);
  assert.equal(b.status, "paid");
  assert.equal(b.autoPay.state, "paid");
  assert.ok(b.chain.payoutTx);
  assert.equal(b.chain.payoutApprovedBy, agent.address.toLowerCase());
  assert.equal(await usdt.balanceOf(contribUser.wallet.address), parseUnits("25", 6));
  assert.equal(await provider.getBalance(ownerAccount), 0n);
  // Calling again (a duplicate webhook or sweep) neither pays twice nor errors.
  assert.equal((await autopay.tryAutoPayout({ projectId: project._id, bountyId: first._id })).status, "skipped");
  assert.equal(await usdt.balanceOf(contribUser.wallet.address), parseUnits("25", 6));
  assert.ok((await SponsoredTx.find({ kind: "auto_payout" }).lean()).every((tx) => tx.status === "confirmed"));

  // --- Above the escrow owner's cap: opting in is refused. ---
  const big = await toSubmitted("Large task", "150");
  await assert.rejects(autopay.setAutoPay({ project, uid: "owner-uid", name: "Olive", number: big.number, enabled: true }), /payout agent for this amount/);

  // --- Opted out: nothing happens even when merged and approved. ---
  const manual = await toSubmitted("Manual task", "10");
  await addReview(manual);
  merge();
  assert.equal((await autopay.tryAutoPayout({ projectId: project._id, bountyId: manual._id })).status, "skipped");
  assert.equal((await Bounty.findById(manual._id)).status, "submitted");

  // --- Turning the agent off on chain stops automation: a later attempt is blocked and the manual path remains. ---
  const late = await toSubmitted("Late task", "10");
  await autopay.setAutoPay({ project, uid: "owner-uid", name: "Olive", number: late.number, enabled: true });
  await idle(late._id);
  assert.equal((await Bounty.findById(late._id)).autoPay.state, "waiting");
  await sign(owner, ownerKey, await permissions.prepareAutoPayAgent({ project, uid: "owner-uid", maxUsdt: null }));
  await addReview(late);
  merge();
  assert.equal((await autopay.tryAutoPayout({ projectId: project._id, bountyId: late._id })).status, "blocked");
  assert.equal((await Bounty.findById(late._id)).status, "submitted");
  assert.equal(await usdt.balanceOf(contribUser.wallet.address), parseUnits("25", 6), "nothing more was paid");

  // --- Only the configured agent's direct settle is sponsored; anyone else's is refused before any gas is spent. ---
  const { assertAllowedSponsorTx } = require("../services/chain/policy");
  const { Interface } = require("ethers");
  const { ESCROW_ABI } = require("../services/chain/abi");
  const iface = new Interface(ESCROW_ABI);
  const settlement = { bountyId: "0x" + "11".repeat(32), claimVersion: 1, recipient: agent.address, amount: 1n, criteriaHash: "0x" + "22".repeat(32), reviewedSha: "0x" + "33".repeat(32), mergeRef: "0x" + "44".repeat(32), reportHash: "0x" + "55".repeat(32) };
  const att = { nonce: 1n, expiry: 2n, signature: "0x" };
  const data = (signer) => iface.encodeFunctionData("settle", [settlement, att, { signer, nonce: 1n, deadline: 2n, signature: "0x" }]);
  const ctx = { escrow: process.env.ESCROW_ADDRESS, factory: process.env.ACCOUNT_FACTORY_ADDRESS, autopay: agent.address };
  assert.equal(assertAllowedSponsorTx({ to: ctx.escrow, data: data(agent.address) }, ctx), "settle");
  assert.throws(() => assertAllowedSponsorTx({ to: ctx.escrow, data: data(attester.address) }, ctx), /payout agent/);
  assert.throws(() => assertAllowedSponsorTx({ to: ctx.escrow, data: data(agent.address) }, { ...ctx, autopay: undefined }), /payout agent/);
});
