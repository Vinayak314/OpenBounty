const express = require("express");
const mongoose = require("mongoose");
const Bounty = require("../models/Bounty");
const User = require("../models/User");
const { requireFirebaseUser } = require("../middleware/requireFirebaseUser");
const { findProjectAccess } = require("../services/projectAccess");
const svc = require("../services/bounties/service");
const permissions = require("../services/bounties/permissions");
const { reconcile } = require("../services/chain/indexer");
const aiOrchestrator = require("../services/ai/orchestrator");
const { sendError } = require("./paymentErrors");
const { limitRequests } = require("../services/rateLimit");

const readLimit = limitRequests({ windowMs: 60000, limit: 120 });
const actionLimit = limitRequests({ windowMs: 60000, limit: 30 });
const resyncLimit = limitRequests({ windowMs: 60000, limit: 10 });

// Mounted at /api/projects/:slug/bounties and /api/projects/:slug/payments.
const bounties = express.Router({ mergeParams: true });
const payments = express.Router({ mergeParams: true });
for (const router of [bounties, payments]) {
  router.use(requireFirebaseUser);
  router.use((req, res, next) => (req.method === "GET" ? readLimit : actionLimit)(req, res, next));
  router.use(async (req, res, next) => {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "The database is not connected." });
    try {
      const { project, allowed } = await findProjectAccess(req.params.slug, req.firebaseUser.uid);
      if (!project) return res.status(404).json({ error: "Project not found." });
      if (!allowed) return res.status(403).json({ error: "You do not have access to this project." });
      req.project = project;
      next();
    } catch (error) {
      sendError(res, error, "Could not load this project.");
    }
  });
}

const handle = (fallback, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (error) {
    sendError(res, error, fallback);
  }
};

async function viewerAccount(uid) {
  const user = await User.findOne({ firebaseUid: uid }).select("wallet.address wallet.kind");
  return user?.wallet?.kind === "passkey" ? user.wallet.address : "";
}

async function respond(req, res, bounty, status = 200) {
  const account = await viewerAccount(req.firebaseUser.uid);
  res.status(status).json({ bounty: await svc.bountyView(bounty, { project: req.project, uid: req.firebaseUser.uid, viewerAccount: account, includeReview: true }) });
}

const queueReview = ({ io, project, prNumber, uid }) => aiOrchestrator.requestReview({ io, project, prNumber, uid });

bounties.get("/", handle("Could not load bounties.", async (req, res) => {
  const list = await Bounty.find({ project: req.project._id }).sort({ number: -1 }).limit(100);
  const account = await viewerAccount(req.firebaseUser.uid);
  const views = await Promise.all(list.map((bounty) => svc.bountyView(bounty, { project: req.project, uid: req.firebaseUser.uid, viewerAccount: account })));
  res.json({ bounties: views, limitation: svc.LIMITATION });
}));

bounties.post("/", handle("Could not create the bounty.", async (req, res) => {
  const bounty = await svc.createDraft({ project: req.project, uid: req.firebaseUser.uid, name: req.firebaseUser.name, input: req.body || {} });
  await respond(req, res, bounty, 201);
}));

bounties.get("/:number", handle("Could not load the bounty.", async (req, res) => {
  await respond(req, res, await svc.findBounty(req.project, req.params.number));
}));

bounties.patch("/:number", handle("Could not update the bounty.", async (req, res) => {
  await respond(req, res, await svc.updateDraft({ project: req.project, uid: req.firebaseUser.uid, number: req.params.number, input: req.body || {} }));
}));

bounties.delete("/:number", handle("Could not delete the draft.", async (req, res) => {
  await svc.deleteDraft({ project: req.project, uid: req.firebaseUser.uid, number: req.params.number });
  res.sendStatus(204);
}));

// Actions that need a passkey approval return an intent: { intentId, challenge, credentialId, summary }.
const intentRoute = (fallback, fn) => handle(fallback, async (req, res) => res.json({ intent: await fn(req) }));
const args = (req) => ({ project: req.project, uid: req.firebaseUser.uid, number: req.params.number });

bounties.post("/:number/fund", intentRoute("Could not prepare funding.", (req) => svc.prepareFund(args(req))));
bounties.post("/:number/claims", handle("Could not request the claim.", async (req, res) => {
  await respond(req, res, await svc.requestClaim({ ...args(req), message: req.body?.message }));
}));
bounties.delete("/:number/claims/mine", handle("Could not withdraw the request.", async (req, res) => {
  await svc.withdrawClaim(args(req));
  await respond(req, res, await svc.findBounty(req.project, req.params.number));
}));
bounties.post("/:number/claims/:requestId/accept", intentRoute("Could not prepare claim acceptance.",
  (req) => svc.prepareAccept({ ...args(req), requestId: req.params.requestId })));
bounties.post("/:number/claims/:requestId/decline", handle("Could not decline the request.", async (req, res) => {
  await svc.declineClaim({ ...args(req), requestId: req.params.requestId });
  await respond(req, res, await svc.findBounty(req.project, req.params.number));
}));
bounties.post("/:number/submission", handle("Could not register the submission.", async (req, res) => {
  const result = await svc.submitPullRequest({ ...args(req), prNumber: req.body?.prNumber, io: req.app.get("io"), queueReview });
  res.json(result);
}));
bounties.post("/:number/payout", intentRoute("Could not prepare the payout.",
  (req) => svc.preparePayout({ ...args(req), acknowledgeWarnings: req.body?.acknowledgeWarnings === true, reportHash: String(req.body?.reportHash || "") })));
bounties.post("/:number/refund", intentRoute("Could not prepare the refund.", (req) => svc.prepareRefund(args(req))));
bounties.post("/:number/cancel/consent", intentRoute("Could not prepare the consent.", (req) => svc.prepareCancelConsent(args(req))));
bounties.post("/:number/cancel", intentRoute("Could not prepare the cancellation.", (req) => svc.prepareCancel(args(req))));
bounties.post("/:number/expire", handle("Could not release the claim.", async (req, res) => res.json(await svc.expireClaim(args(req)))));
bounties.post("/:number/resync", resyncLimit, handle("Could not sync with the escrow.", async (req, res) => {
  const bounty = await svc.findBounty(req.project, req.params.number);
  await reconcile(bounty);
  await respond(req, res, await svc.findBounty(req.project, req.params.number));
}));

payments.get("/", handle("Could not load payment settings.", async (req, res) => {
  res.json(await permissions.paymentsOverview(req.project, req.firebaseUser.uid));
}));
payments.post("/roles", intentRoute("Could not prepare the permission change.", (req) => permissions.prepareRoles({
  project: req.project, uid: req.firebaseUser.uid, targetUid: String(req.body?.uid || ""),
  maintainer: typeof req.body?.maintainer === "boolean" ? req.body.maintainer : undefined,
  settlement: typeof req.body?.settlement === "boolean" ? req.body.settlement : undefined,
})));
payments.post("/ownership/accept", intentRoute("Could not prepare the ownership transfer.",
  (req) => permissions.prepareAcceptOwnership({ project: req.project, uid: req.firebaseUser.uid })));

module.exports = { bounties, payments };
