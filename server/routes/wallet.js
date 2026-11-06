const express = require("express");
const mongoose = require("mongoose");
const { requireFirebaseUser } = require("../middleware/requireFirebaseUser");
const { getOrCreateUser } = require("../services/users");
const { publicChainConfig } = require("../config/chain");
const wallet = require("../services/chain/wallet");
const sponsor = require("../services/chain/sponsor");
const { sendError } = require("./paymentErrors");

const router = express.Router();
router.use(requireFirebaseUser);

// Simple per-user throttle for passkey ceremonies and relays (the sponsor has its own budget limits too).
const recent = new Map();
function throttle(req, res, next) {
  const key = req.firebaseUser.uid;
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((at) => now - at < 60000);
  if (hits.length >= 20) return res.status(429).json({ error: "Too many payment requests. Wait a minute and try again." });
  hits.push(now);
  recent.set(key, hits);
  if (recent.size > 5000) recent.delete(recent.keys().next().value);
  next();
}

function ensureDatabase(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ error: "The database is not connected." });
  return false;
}

router.get("/", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    const config = publicChainConfig();
    const account = config.accountsEnabled ? await wallet.accountSummary(user).catch(() => null) : null;
    res.json({ config, account, hasAccount: user.wallet?.kind === "passkey" && Boolean(user.wallet.address) });
  } catch (error) {
    sendError(res, error, "Could not load your payment account.");
  }
});

router.post("/passkey/options", throttle, async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    res.json(await wallet.registrationOptions(user));
  } catch (error) {
    sendError(res, error, "Could not start account setup.");
  }
});

router.post("/passkey/register", throttle, async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    const updated = await wallet.registerPasskey(user, req.body || {});
    res.json({ account: await wallet.accountSummary(updated) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "That account is already linked to another user." });
    sendError(res, error, "Could not create your payment account.");
  }
});

router.post("/deploy", throttle, async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    await wallet.ensureDeployed(user);
    res.json({ account: await wallet.accountSummary(user) });
  } catch (error) {
    sendError(res, error, "Could not activate your payment account.");
  }
});

router.post("/intents/:intentId/submit", throttle, async (req, res) => {
  if (!ensureDatabase(res)) return;
  if (!mongoose.isObjectIdOrHexString(req.params.intentId)) return res.status(400).json({ error: "Invalid request." });
  try {
    const user = await getOrCreateUser(req.firebaseUser);
    const result = await wallet.submitIntent({ user, intentId: req.params.intentId, assertion: req.body?.assertion });
    res.json({ ...result, explorer: result.txHash ? `${publicChainConfig().explorerUrl}/tx/${result.txHash}` : "" });
  } catch (error) {
    sendError(res, error, "Could not complete this payment action.");
  }
});

router.get("/sponsor", async (_req, res) => {
  try {
    res.json({ sponsor: await sponsor.status() });
  } catch (error) {
    sendError(res, error, "Could not read the sponsor status.");
  }
});

module.exports = router;
