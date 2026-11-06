const { createHmac, timingSafeEqual } = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const Project = require("../models/Project");
const Review = require("../models/Review");
const { reviewRepositoryEnabled } = require("../services/github");
const { queuePullRequestReview } = require("../services/ai/orchestrator");
const { hasReviewCriteria } = require("../services/review/criteriaSource");

const router = express.Router();
const reviewActions = new Set(["opened", "reopened", "synchronize", "ready_for_review", "closed"]);
const SHA = /^[0-9a-f]{40}$/i;

// GitHub retries deliveries; the same X-GitHub-Delivery ID is processed once per process.
const DELIVERY_TTL_MS = 60 * 60 * 1000;
const MAX_DELIVERIES = 2000;
const deliveries = new Map(); // delivery id -> received at

function seenDelivery(id, now = Date.now()) {
  if (!id) return false;
  for (const [key, at] of deliveries) {
    if (now - at < DELIVERY_TTL_MS && deliveries.size < MAX_DELIVERIES) break;
    deliveries.delete(key);
  }
  if (deliveries.has(id)) return true;
  deliveries.set(id, now);
  return false;
}

function verifySignature(secret, body, signature) {
  if (!Buffer.isBuffer(body) || !/^sha256=[0-9a-f]{64}$/.test(signature || "")) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

async function activeProject(repo) {
  const project = await Project.findOne({ "githubRepository.fullName": repo, status: "active" })
    .collation({ locale: "en", strength: 2 });
  return project || null;
}

async function handlePullRequest(req, event) {
  const repo = event.repository.full_name;
  const pr = event.pull_request;
  if (!reviewActions.has(event.action)) return { code: 204 };
  if (!Number.isSafeInteger(event.number) || event.number < 1 || !SHA.test(pr?.head?.sha || "")
    || pr.base?.repo?.full_name?.toLowerCase() !== repo.toLowerCase()) return { code: 400 };
  if (pr.draft && event.action !== "closed") return { code: 204 };
  const project = await activeProject(repo);
  if (!project || !(await hasReviewCriteria(project, event.number))) return { code: 204 };
  const status = queuePullRequestReview({
    io: req.app.get("io"), project, prNumber: event.number, expectedHeadSha: pr.head.sha, action: event.action,
  });
  return { code: status === "busy" ? 503 : 202, status };
}

// CI finished for a commit: refresh CI on reports that already exist for that exact commit (no new inference).
async function handleCiEvent(req, name, event) {
  let sha = "";
  let prNumbers = [];
  if (name === "check_suite") {
    if (event.action !== "completed") return { code: 204 };
    sha = event.check_suite?.head_sha || "";
    prNumbers = (event.check_suite?.pull_requests || []).map((pr) => pr.number);
  } else {
    if (event.state === "pending") return { code: 204 };
    sha = event.sha || "";
  }
  if (!SHA.test(sha)) return { code: 400 };
  const project = await activeProject(event.repository.full_name);
  if (!project) return { code: 204 };
  const reviewed = await Review.distinct("prNumber", { project: project._id, headSha: sha, status: "complete" });
  const targets = [...new Set(prNumbers.length ? prNumbers.filter((n) => reviewed.includes(n)) : reviewed)].slice(0, 5);
  if (!targets.length) return { code: 204 };
  const statuses = targets.map((prNumber) => queuePullRequestReview({
    io: req.app.get("io"), project, prNumber, expectedHeadSha: sha, action: "ci", source: "ci",
  }));
  return { code: 202, status: statuses.includes("queued") ? "queued" : statuses[0] };
}

router.post("/", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  if (!secret) return res.sendStatus(503);
  if (!verifySignature(secret, req.body, req.get("X-Hub-Signature-256"))) return res.sendStatus(401);
  const name = req.get("X-GitHub-Event");
  if (name === "ping") return res.status(200).json({ status: "pong" });
  if (!["pull_request", "check_suite", "status"].includes(name)) return res.sendStatus(204);

  let event;
  try { event = JSON.parse(req.body.toString("utf8")); } catch { return res.sendStatus(400); }
  const repo = event?.repository?.full_name;
  if (!reviewRepositoryEnabled(repo) || event.repository.private) return res.sendStatus(204);
  if (mongoose.connection.readyState !== 1) return res.sendStatus(503);
  const delivery = String(req.get("X-GitHub-Delivery") || "").slice(0, 100);
  if (seenDelivery(delivery)) return res.status(200).json({ status: "duplicate_delivery" });

  try {
    const result = name === "pull_request" ? await handlePullRequest(req, event) : await handleCiEvent(req, name, event);
    // Forget rejected deliveries so a manual "Redeliver" from GitHub's webhook page is processed. GitHub does not
    // retry failed deliveries on its own.
    if (result.code >= 400) deliveries.delete(delivery);
    return result.status ? res.status(result.code).json({ status: result.status }) : res.sendStatus(result.code);
  } catch (error) {
    deliveries.delete(delivery);
    console.error("GitHub webhook could not queue review:", error.message);
    return res.sendStatus(500);
  }
});

module.exports = router;
module.exports.verifySignature = verifySignature;
module.exports.seenDelivery = seenDelivery;
