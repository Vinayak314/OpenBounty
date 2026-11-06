const crypto = require("node:crypto");
const { hexlify, getAddress, Interface } = require("ethers");
const User = require("../../models/User");
const WalletIntent = require("../../models/WalletIntent");
const { chain, ChainError, describeRevert } = require("./client");
const { publicKeyFromSpki, verifyAssertion, encodeContractSignature, WebAuthnError } = require("./webauthn");
const { executeDigest } = require("./eip712");
const { assertAllowedAccountCalls } = require("./policy");
const { sendSponsored } = require("./sponsor");
const { processReceipt } = require("./indexer");
const { FACTORY_ABI, ACCOUNT_ABI } = require("./abi");

const factoryIface = new Interface(FACTORY_ABI);
const accountIface = new Interface(ACCOUNT_ABI);
const INTENT_TTL_SECONDS = 10 * 60;

function passkeyOf(user) {
  const wallet = user?.wallet;
  if (wallet?.kind !== "passkey" || !wallet.address || !wallet.passkey?.qx) {
    throw new ChainError("Set up your payment account first (Wallet page).", "no_account", 409);
  }
  return wallet;
}

/** Step 1 of setup: a single-use challenge for creating the passkey and proving possession of it. */
async function registrationOptions(user) {
  const { config } = chain();
  if (!config.accountsEnabled) throw new ChainError("Payment accounts are not configured on this server yet.", "payments_disabled");
  if (user.wallet?.kind === "passkey" && user.wallet.address) throw new ChainError("You already have a payment account.", "account_exists", 409);
  const challenge = hexlify(crypto.randomBytes(32));
  user.wallet.challengeMessage = challenge;
  user.wallet.challengeExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await user.save();
  return {
    challenge: Buffer.from(challenge.slice(2), "hex").toString("base64url"),
    rp: { id: config.rpId, name: config.rpName },
    user: {
      id: crypto.createHash("sha256").update(`openbounty:${user.firebaseUid}`).digest("base64url"),
      name: user.github?.username || user.email || user.displayName || "OpenBounty user",
      displayName: user.displayName || user.github?.username || "OpenBounty user",
    },
  };
}

/**
 * Step 2: the browser created a passkey (public key in SPKI form) and signed the same challenge with it.
 * Verifying that assertion proves the user holds the key before we bind the account as their recipient.
 */
async function registerPasskey(user, { credentialId, publicKey, assertion }) {
  const { config, factory } = chain();
  const challenge = user.wallet?.challengeMessage;
  if (!challenge || !user.wallet.challengeExpiresAt || user.wallet.challengeExpiresAt < new Date()) {
    throw new ChainError("Account setup expired. Start again.", "challenge_expired", 400);
  }
  if (typeof credentialId !== "string" || !/^[A-Za-z0-9_-]{16,1400}$/.test(credentialId)) throw new WebAuthnError("Malformed passkey id.");
  const { qx, qy } = publicKeyFromSpki(publicKey);
  verifyAssertion({ assertion, challenge, qx, qy, rpId: config.rpId, origins: config.origins });
  const address = getAddress(await factory.accountAddress(qx, qy)).toLowerCase();

  const updated = await User.findOneAndUpdate(
    { _id: user._id, "wallet.challengeMessage": challenge },
    { $set: {
      "wallet.address": address, "wallet.chainId": config.chainId, "wallet.kind": "passkey", "wallet.connectedAt": new Date(),
      "wallet.passkey": { credentialId, qx, qy }, "wallet.deployed": false, "wallet.deployTx": "",
      "wallet.challengeMessage": "", "wallet.challengeExpiresAt": null,
    } },
    { returnDocument: "after" },
  );
  if (!updated) throw new ChainError("Account setup was already completed or expired.", "challenge_expired", 400);
  // Deploy right away (sponsored). If this fails, the first payment action deploys it.
  ensureDeployed(updated).catch((error) => console.error("Account deployment deferred:", error.message));
  return updated;
}

async function ensureDeployed(user) {
  const { provider, config } = chain();
  const wallet = passkeyOf(user);
  if ((await provider.getCode(wallet.address)) !== "0x") {
    if (!wallet.deployed) await User.updateOne({ _id: user._id }, { $set: { "wallet.deployed": true } });
    return null;
  }
  const receipt = await sendSponsored({
    userUid: user.firebaseUid, kind: "create_account", to: config.accountFactory,
    data: factoryIface.encodeFunctionData("createAccount", [wallet.passkey.qx, wallet.passkey.qy]), account: wallet.address,
  });
  await User.updateOne({ _id: user._id }, { $set: { "wallet.deployed": true, "wallet.deployTx": receipt.hash } });
  return receipt;
}

async function accountSummary(user) {
  const { provider, token, config } = chain();
  const wallet = user?.wallet;
  if (wallet?.kind !== "passkey" || !wallet.address) return null;
  const [code, usdt, gas] = await Promise.all([
    provider.getCode(wallet.address), token.balanceOf(wallet.address).catch(() => null), provider.getBalance(wallet.address),
  ]);
  return {
    address: getAddress(wallet.address), deployed: code !== "0x", deployTx: wallet.deployTx || "",
    credentialId: wallet.passkey.credentialId, chainId: config.chainId,
    usdtBalance: usdt === null ? null : usdt.toString(), gasBalance: gas.toString(),
  };
}

/** Creates a server-built batch for the user's passkey account to sign. */
async function createExecuteIntent({ user, kind, calls, project, bounty, summary, meta = {} }) {
  const { config, provider, account } = chain();
  const wallet = passkeyOf(user);
  assertAllowedAccountCalls(calls, { escrow: config.escrow, token: config.token, maxAmount: config.sponsor.maxBountyUnits });
  const deployed = (await provider.getCode(wallet.address)) !== "0x";
  const nonce = deployed ? (await account(wallet.address).nonce()).toString() : "0";
  const deadline = Math.floor(Date.now() / 1000) + INTENT_TTL_SECONDS;
  const digest = executeDigest({ chainId: config.chainId, account: wallet.address, calls, nonce, deadline });
  const intent = await WalletIntent.create({
    userUid: user.firebaseUid, account: wallet.address, kind, mode: "execute", project, bounty,
    calls: calls.map((call) => ({ target: call.target, value: String(call.value || 0), data: call.data })),
    nonce, deadline, digest, summary, meta, expiresAt: new Date(deadline * 1000),
  });
  return intentResponse(intent, wallet);
}

/** Creates an off-chain signature request (ERC-1271), e.g. a claimant's cancellation consent. */
async function createSignIntent({ user, kind, digest, project, bounty, summary, meta = {}, deadline }) {
  const wallet = passkeyOf(user);
  const intent = await WalletIntent.create({
    userUid: user.firebaseUid, account: wallet.address, kind, mode: "sign", project, bounty, deadline,
    digest, summary, meta, expiresAt: new Date(Math.min(deadline * 1000, Date.now() + INTENT_TTL_SECONDS * 1000)),
  });
  return intentResponse(intent, wallet);
}

function intentResponse(intent, wallet) {
  return {
    intentId: intent.id, kind: intent.kind, mode: intent.mode, summary: intent.summary,
    challenge: Buffer.from(intent.digest.slice(2), "hex").toString("base64url"),
    credentialId: wallet.passkey.credentialId, expiresAt: intent.expiresAt,
  };
}

const hooks = new Map(); // kind -> async ({ intent, signature, receipt }) => void
const onIntent = (kind, hook) => hooks.set(kind, hook);

/** Verifies the passkey assertion for an intent, then relays it through the sponsor (or stores the signature). */
async function submitIntent({ user, intentId, assertion }) {
  const { config, account } = chain();
  const wallet = passkeyOf(user);
  const intent = await WalletIntent.findOne({ _id: intentId, userUid: user.firebaseUid });
  if (!intent) throw new ChainError("This approval request was not found.", "intent_not_found", 404);
  if (intent.status !== "pending") throw new ChainError("This approval request was already used.", "intent_used", 409);
  if (intent.expiresAt < new Date()) {
    await WalletIntent.updateOne({ _id: intent._id }, { status: "expired" });
    throw new ChainError("This approval request expired. Start the action again.", "intent_expired", 410);
  }
  if (intent.account !== wallet.address) throw new ChainError("Your payment account changed. Start again.", "account_changed", 409);
  const parts = verifyAssertion({ assertion, challenge: intent.digest, qx: wallet.passkey.qx, qy: wallet.passkey.qy, rpId: config.rpId, origins: config.origins });
  const signature = encodeContractSignature(parts);

  const claimed = await WalletIntent.findOneAndUpdate({ _id: intent._id, status: "pending" }, { $set: { status: "submitted" } }, { returnDocument: "after" });
  if (!claimed) throw new ChainError("This approval request was already used.", "intent_used", 409);

  try {
    if (intent.mode === "sign") {
      await hooks.get(intent.kind)?.({ intent, signature });
      await WalletIntent.updateOne({ _id: intent._id }, { status: "confirmed" });
      return { status: "signed" };
    }
    await ensureDeployed(user);
    const current = (await account(wallet.address).nonce()).toString();
    if (current !== intent.nonce) throw new ChainError("Another action used your account first. Start again.", "nonce_changed", 409);
    const calls = intent.calls.map((call) => ({ target: call.target, value: BigInt(call.value), data: call.data }));
    const receipt = await sendSponsored({
      userUid: user.firebaseUid, kind: intent.kind, to: wallet.address, account: wallet.address, bounty: intent.bounty,
      data: accountIface.encodeFunctionData("execute", [calls, intent.deadline, signature]), isAccount: true,
    });
    await processReceipt(receipt);
    await WalletIntent.updateOne({ _id: intent._id }, { status: "confirmed", txHash: receipt.hash });
    await hooks.get(intent.kind)?.({ intent, receipt });
    return { status: "confirmed", txHash: receipt.hash };
  } catch (error) {
    const message = error.code ? error.message : describeRevert(error).message;
    await WalletIntent.updateOne({ _id: intent._id }, { status: error.code === "pending" ? "submitted" : "failed", error: String(message).slice(0, 400) });
    throw error.code ? error : new ChainError(message, "execution_failed", 409);
  }
}

module.exports = { registrationOptions, registerPasskey, ensureDeployed, accountSummary, createExecuteIntent, createSignIntent, submitIntent, onIntent, passkeyOf };
