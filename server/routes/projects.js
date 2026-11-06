const express = require("express");
const mongoose = require("mongoose");
const ChatMessage = require("../models/ChatMessage");
const Review = require("../models/Review");
const ReviewJob = require("../models/ReviewJob");
const { requireFirebaseUser } = require("../middleware/requireFirebaseUser");
const { findProjectAccess, isProjectMaintainer } = require("../services/projectAccess");
const { AGENT_UID, messageResponse, reportView } = require("../services/chatSerializer");
const { approveCriteria, criteriaView, CriteriaError } = require("../services/criteria");
const { criteriaMapFor, criteriaStillCurrent } = require("../services/review/criteriaSource");
const { fetchPullRequestHead } = require("../services/github");
const aiOrchestrator = require("../services/ai/orchestrator");

const router = express.Router();
router.use(requireFirebaseUser);

function ensureDatabase(res) {
  if (mongoose.connection.readyState === 1) return true;
  res.status(503).json({ error: "The database is not connected." });
  return false;
}

async function accessibleProject(req, res) {
  const { project, allowed } = await findProjectAccess(req.params.slug, req.firebaseUser.uid);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return null;
  }
  if (!allowed) {
    res.status(403).json({ error: "You do not have access to this project." });
    return null;
  }
  return project;
}

function emitToProject(req, project, event, payload) {
  req.app.get("io")?.to(`project:${project.id}`).emit(event, payload);
}

router.get("/:slug", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const { project, allowed, canManageGroup } = await findProjectAccess(req.params.slug, req.firebaseUser.uid);
    if (!project) return res.status(404).json({ error: "Project not found." });
    if (!allowed) return res.status(403).json({ error: "You do not have access to this project." });
    res.json({ project: {
      id: project.id, slug: project.slug, name: project.name,
      description: project.description, repository: project.githubRepository,
      owner: project.owner.displayName || project.owner.firebaseUid,
      canManageGroup,
      canMaintain: project.status === "active" && isProjectMaintainer(project, req.firebaseUser.uid),
      criteria: criteriaView(project.criteria),
    } });
  } catch (error) {
    console.error("Could not load project:", error.message);
    res.status(500).json({ error: "Could not load this project." });
  }
});

router.get("/:slug/ai/status", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    res.json({ ai: aiOrchestrator.status(), commands: aiOrchestrator.COMMANDS });
  } catch (error) {
    console.error("Could not load AI status:", error.message);
    res.status(500).json({ error: "Could not load AI status." });
  }
});

router.get("/:slug/reviews", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const latest = await Review.aggregate([
      { $match: { project: project._id } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: "$prNumber", review: { $first: "$$ROOT" } } },
      { $sort: { "review.createdAt": -1 } },
      { $limit: 20 },
    ]);
    const jobs = await ReviewJob.find({ project: project._id }).sort({ updatedAt: -1 }).limit(20).lean();
    res.json({
      reviews: await (async () => {
        const hydrated = latest.map(({ review }) => Review.hydrate(review));
        const criteriaFor = await criteriaMapFor(project, hydrated);
        return hydrated.map((review) => reportView(review, criteriaFor(review)));
      })(),
      jobs: jobs.map((job) => ({
        prNumber: job.prNumber, status: job.status, source: job.source, headSha: job.headSha,
        errorCode: job.errorCode, error: job.error, attempts: job.attempts, updatedAt: job.updatedAt,
        reviewId: job.review ? String(job.review) : "",
      })),
      canApprove: project.status === "active" && isProjectMaintainer(project, req.firebaseUser.uid),
      canRequest: project.status === "active" && Boolean(project.githubRepository?.fullName),
    });
  } catch (error) {
    console.error("Could not load reviews:", error.message);
    res.status(500).json({ error: "Could not load review evidence." });
  }
});

router.post("/:slug/reviews/:reviewId/approve", async (req, res) => {
  if (!ensureDatabase(res)) return;
  if (!mongoose.isObjectIdOrHexString(req.params.reviewId)) return res.status(400).json({ error: "Invalid review." });
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    if (project.status !== "active" || !isProjectMaintainer(project, req.firebaseUser.uid)) {
      return res.status(403).json({ error: "Only an authorized maintainer can approve this review." });
    }
    const review = await Review.findOne({ _id: req.params.reviewId, project: project._id });
    if (!review) return res.status(404).json({ error: "Review not found." });
    if (review.bounty) return res.status(409).json({ error: "This PR is a bounty submission. Approve its payout from the bounty." });
    const view = reportView(review, project.criteria);
    if (view.stale || !review.requestId || !review.reportHash || req.body?.reportHash !== review.reportHash) {
      return res.status(409).json({ error: "The evidence is missing or has changed. Open the latest report." });
    }
    const head = await fetchPullRequestHead(project.githubRepository.fullName, review.prNumber);
    if (head.headSha !== review.headSha) {
      await Review.updateOne({ _id: review._id }, { $set: { status: "stale" } });
      return res.status(409).json({ error: "The PR commit changed. Run a new review before approving." });
    }
    if (head.state !== "merged") return res.status(409).json({ error: "Merge the reviewed PR on GitHub before approving its evidence." });
    const current = await criteriaStillCurrent(project, review);
    if (!current) return res.status(409).json({ error: "Project settings changed. Open the latest report." });

    const filter = { _id: review._id, project: project._id, status: "complete", reportHash: review.reportHash };
    const approved = await Review.findOneAndUpdate({ ...filter, "approval.at": { $exists: false } }, {
      $set: {
        prState: "merged",
        approval: { byUid: req.firebaseUser.uid, byName: (req.firebaseUser.name || "Maintainer").slice(0, 120), at: new Date() },
      },
    }, { returnDocument: "after" }) || await Review.findOne(filter);
    if (!approved?.approval?.at) return res.status(409).json({ error: "The review changed. Open the latest report." });
    emitToProject(req, project, "review:completed", { reviewId: approved.id });
    res.json({ review: reportView(approved, project.criteria) });
  } catch (error) {
    console.error("Could not approve review:", error.message);
    res.status(error.code === "rate_limited" ? 503 : 500).json({ error: "Could not verify the GitHub PR for approval. Try again." });
  }
});

// Ask for a fresh review (or a retry after a failure) of one PR. Same rate limits as `/review` in chat.
router.post("/:slug/pulls/:prNumber/review", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const prNumber = Number(req.params.prNumber);
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    if (project.status !== "active" || !project.githubRepository?.fullName) {
      return res.status(409).json({ error: "Connect an active GitHub repository before requesting reviews." });
    }
    const result = aiOrchestrator.requestReview({
      io: req.app.get("io"), project, prNumber, uid: req.firebaseUser.uid, force: req.body?.force === true,
    });
    const codes = { queued: 202, invalid: 400, rate_limited: 429, busy: 503, disabled: 503 };
    res.status(codes[result.status] || 500).json(result.error ? { error: result.error } : { status: result.status });
  } catch (error) {
    console.error("Could not request review:", error.message);
    res.status(500).json({ error: "Could not request a review." });
  }
});

router.get("/:slug/criteria", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    res.json({
      criteria: criteriaView(project.criteria),
      canEdit: project.status === "active" && isProjectMaintainer(project, req.firebaseUser.uid),
    });
  } catch (error) {
    console.error("Could not load criteria:", error.message);
    res.status(500).json({ error: "Could not load criteria." });
  }
});

async function maintainedProject(req, res) {
  const project = await accessibleProject(req, res);
  if (!project) return null;
  if (project.status !== "active" || !isProjectMaintainer(project, req.firebaseUser.uid)) {
    res.status(403).json({ error: "Only the project owner or a co-owner can change criteria." });
    return null;
  }
  return project;
}

// Scope assistant (0G) drafts editable criteria. Nothing is saved until a maintainer approves.
router.post("/:slug/criteria/draft", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const task = typeof req.body?.task === "string" ? req.body.task.trim().slice(0, 2000) : "";
  const issueNumber = req.body?.issueNumber == null || req.body.issueNumber === "" ? null : Number(req.body.issueNumber);
  if (issueNumber !== null && (!Number.isSafeInteger(issueNumber) || issueNumber < 1)) {
    return res.status(400).json({ error: "Enter a valid issue number." });
  }
  try {
    const project = await maintainedProject(req, res);
    if (!project) return;
    const draft = await aiOrchestrator.draftCriteria({
      io: req.app.get("io"), project, uid: req.firebaseUser.uid, authorName: req.firebaseUser.name || "", task, issueNumber,
    });
    res.json({ draft: { ...draft, trace: undefined, provider: draft.trace?.provider || "", e2ee: draft.trace?.e2ee || "" } });
  } catch (error) {
    const codes = { not_configured: 503, rate_limited: 429, timeout: 504, unreachable: 503, empty_question: 400,
      issue_not_found: 404, malformed_output: 502, empty_output: 502, upstream_error: 502 };
    if (!codes[error.code]) console.error("Criteria draft failed:", error.message);
    res.status(codes[error.code] || 500).json({ error: codes[error.code] ? error.message : "Could not draft criteria.", code: error.code || "" });
  }
});

// A maintainer approves the edited list. Creates a new version and stales evidence for older versions.
router.put("/:slug/criteria", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const items = Array.isArray(req.body?.items) ? req.body.items.filter((item) => typeof item === "string") : null;
  const expectedVersion = Number.isSafeInteger(req.body?.expectedVersion) ? req.body.expectedVersion : undefined;
  if (!items) return res.status(400).json({ error: "Send the criteria as a list of text items." });
  try {
    const project = await maintainedProject(req, res);
    if (!project) return;
    const byName = req.firebaseUser.name || "Maintainer";
    const criteria = await approveCriteria({ project, texts: items, byUid: req.firebaseUser.uid, byName, expectedVersion });
    const io = req.app.get("io");
    io?.to(`project:${project.id}`).emit("criteria:updated", { version: criteria.version, hash: criteria.hash });
    await aiOrchestrator.postAgentMessage({
      io, project, trigger: { id: "", body: "", authorName: byName }, role: "scope",
      body: aiOrchestrator.criteriaApprovedText(criteria, byName), ai: { status: "ok" },
    });
    res.json({ criteria: criteriaView(criteria) });
  } catch (error) {
    if (error instanceof CriteriaError) {
      return res.status(error.code === "version_conflict" ? 409 : error.code === "project_not_found" ? 404 : 400).json({ error: error.message });
    }
    console.error("Could not approve criteria:", error.message);
    res.status(500).json({ error: "Could not approve criteria." });
  }
});

// Every 0G inference in this project's main flows (guide answers, criteria drafts, PR reviews) with its request ID.
router.get("/:slug/ai/activity", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const agentFilter = { project: project._id, authorUid: AGENT_UID };
    const [recent, totals] = await Promise.all([
      ChatMessage.find({ ...agentFilter, $or: [{ "agent.requestId": { $nin: ["", null] } }, { "agent.status": "error" }] })
        .sort({ _id: -1 }).limit(40).populate("review", "prNumber headSha verdict status").lean(),
      ChatMessage.aggregate([
        { $match: { ...agentFilter, "agent.requestId": { $nin: ["", null] } } },
        { $group: { _id: "$agent.role", runs: { $sum: 1 },
          tokens: { $sum: { $add: [{ $ifNull: ["$agent.promptTokens", 0] }, { $ifNull: ["$agent.completionTokens", 0] }] } } } },
      ]),
    ]);
    const errors = await ChatMessage.countDocuments({ ...agentFilter, "agent.status": "error",
      "agent.errorCode": { $nin: ["forbidden", "empty_question", "empty_criteria", "invalid_criteria", "wrong_repo", "stale", "draft"] } });
    const byRole = Object.fromEntries(totals.map((row) => [row._id || "guide", { runs: row.runs, tokens: row.tokens }]));
    res.json({
      totals: {
        runs: totals.reduce((sum, row) => sum + row.runs, 0),
        tokens: totals.reduce((sum, row) => sum + row.tokens, 0),
        byRole, errors,
      },
      provider: aiOrchestrator.status(),
      recent: recent.map((message) => ({
        id: String(message._id),
        at: message.createdAt,
        role: message.agent?.role || "guide",
        status: message.agent?.status || "ok",
        requestId: message.agent?.requestId || "",
        model: message.agent?.model || "",
        provider: message.agent?.provider || "",
        e2ee: message.agent?.e2ee || "",
        tokens: (message.agent?.promptTokens || 0) + (message.agent?.completionTokens || 0),
        repoSha: message.agent?.repoSha || "",
        errorCode: message.agent?.errorCode || "",
        summary: String(message.body || "").replace(/\s+/g, " ").slice(0, 140),
        review: message.review?.prNumber ? {
          prNumber: message.review.prNumber, headSha: message.review.headSha, verdict: message.review.verdict, stale: message.review.status === "stale",
        } : null,
      })),
    });
  } catch (error) {
    console.error("Could not load AI activity:", error.message);
    res.status(500).json({ error: "Could not load AI activity." });
  }
});

router.get("/:slug/messages", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const messages = await ChatMessage.find({ project: project._id }).sort({ createdAt: -1, _id: -1 }).limit(500).populate("review");
    res.json({ messages: messages.reverse().map((message) => messageResponse(message, req.firebaseUser.uid)) });
  } catch (error) {
    console.error("Could not load project chat:", error.message);
    res.status(500).json({ error: "Could not load project messages." });
  }
});

router.post("/:slug/messages", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const clientMessageId = req.body?.clientMessageId;
  if (clientMessageId !== undefined && (typeof clientMessageId !== "string"
    || !/^[0-9a-f]{32}$/.test(clientMessageId))) {
    return res.status(400).json({ error: "Invalid message identifier." });
  }
  if (!body && !rawAttachments.length) return res.status(400).json({ error: "Write a message or attach a file." });
  if (body.length > 10000 || rawAttachments.length > 5) return res.status(400).json({ error: "Messages can contain up to 10,000 characters and five attachments." });
  const attachments = rawAttachments.map((attachment) => ({
    name: typeof attachment?.name === "string" ? attachment.name.trim().slice(0, 255) : "",
    preview: typeof attachment?.preview === "string" && /^data:image\/(png|jpeg|gif|webp);base64,/.test(attachment.preview) && attachment.preview.length <= 600000
      ? attachment.preview : "",
  }));
  if (attachments.some((attachment) => !attachment.name)) return res.status(400).json({ error: "Each attachment needs a file name." });
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const message = await ChatMessage.create({
      project: project._id,
      authorUid: req.firebaseUser.uid,
      authorName: req.firebaseUser.name || "GitHub user",
      authorPhoto: req.firebaseUser.picture || "",
      clientMessageId,
      body,
      attachments,
      replyTo: req.body?.replyTo && typeof req.body.replyTo === "object" ? {
        id: String(req.body.replyTo.id || "").slice(0, 80),
        author: String(req.body.replyTo.author || "").slice(0, 120),
        snippet: String(req.body.replyTo.snippet || "").slice(0, 120),
      } : undefined,
    });
    emitToProject(req, project, "chat:message-created", messageResponse(message));
    res.status(201).json({ message: messageResponse(message, req.firebaseUser.uid) });
    // Fire-and-forget: inference never blocks or fails the user's own message.
    aiOrchestrator.handleMessage({ io: req.app.get("io"), project, message }).catch((error) => {
      console.error("AI orchestration failed:", error.message);
    });
  } catch (error) {
    console.error("Could not send project message:", error.message);
    res.status(500).json({ error: "Could not send your message." });
  }
});

router.put("/:slug/messages/:messageId", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body || body.length > 10000) return res.status(400).json({ error: "Write a message up to 10,000 characters." });
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const message = await ChatMessage.findOneAndUpdate(
      { _id: req.params.messageId, project: project._id, authorUid: req.firebaseUser.uid },
      { $set: { body, edited: true } }, { returnDocument: "after", runValidators: true },
    );
    if (!message) return res.status(404).json({ error: "Message not found or you cannot edit it." });
    emitToProject(req, project, "chat:message-updated", messageResponse(message));
    res.json({ message: messageResponse(message, req.firebaseUser.uid) });
  } catch (error) {
    console.error("Could not edit project message:", error.message);
    res.status(500).json({ error: "Could not edit that message." });
  }
});

router.delete("/:slug/messages/:messageId", async (req, res) => {
  if (!ensureDatabase(res)) return;
  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const message = await ChatMessage.findOneAndDelete({
      _id: req.params.messageId, project: project._id, authorUid: req.firebaseUser.uid,
    });
    if (!message) return res.status(404).json({ error: "Message not found or you cannot delete it." });
    emitToProject(req, project, "chat:message-deleted", { id: message.id });
    res.sendStatus(204);
  } catch (error) {
    console.error("Could not delete project message:", error.message);
    res.status(500).json({ error: "Could not delete that message." });
  }
});

router.patch("/:slug/messages/:messageId/reactions", async (req, res) => {
  if (!ensureDatabase(res)) return;
  const emoji = typeof req.body?.emoji === "string" ? req.body.emoji : "";
  if (!["👍", "🎉", "👀", "❤️"].includes(emoji)) return res.status(400).json({ error: "Choose a supported reaction." });

  try {
    const project = await accessibleProject(req, res);
    if (!project) return;
    const message = await ChatMessage.findOne({ _id: req.params.messageId, project: project._id }).populate("review");
    if (!message) return res.status(404).json({ error: "Message not found." });

    let reaction = message.reactions.find((item) => item.emoji === emoji);
    if (!reaction) {
      reaction = { emoji, users: [] };
      message.reactions.push(reaction);
    }
    const index = reaction.users.indexOf(req.firebaseUser.uid);
    const active = index === -1;
    if (active) reaction.users.push(req.firebaseUser.uid);
    else reaction.users.splice(index, 1);
    if (reaction.users.length === 0) message.reactions = message.reactions.filter((item) => item.emoji !== emoji);
    const count = reaction.users.length;
    await message.save();

    const update = { id: message.id, emoji, count, active, userId: req.firebaseUser.uid };
    emitToProject(req, project, "chat:reaction-updated", update);
    res.json({ message: messageResponse(message, req.firebaseUser.uid) });
  } catch (error) {
    console.error("Could not update project reaction:", error.message);
    res.status(500).json({ error: "Could not update that reaction." });
  }
});

module.exports = router;
