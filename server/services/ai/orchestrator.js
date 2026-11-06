const mongoose = require("mongoose");
const ChatMessage = require("../../models/ChatMessage");
const { getAiConfig } = require("../../config/ai");
const { AGENT_UID, messageResponse } = require("../chatSerializer");
const { buildContext } = require("./context");
const { buildMessages } = require("./prompts");
const { detectTrigger, COMMANDS } = require("./triggers");
const { chatCompletion, AiError } = require("./zeroG");
const crypto = require("node:crypto");
const Project = require("../../models/Project");
const { reviewPullRequest, ReviewError } = require("../review/reviewer");
const { VERDICTS } = require("../review/validate");

// In-memory limits are enough for a single-process MVP; move to Redis/Mongo if the API scales out.
const userWindows = new Map();
const projectWindows = new Map();
const queues = new Map(); // projectId -> { running: boolean, jobs: [] }

function allow(windows, key, limit, now = Date.now()) {
  const recent = (windows.get(key) || []).filter((t) => now - t < 60000);
  if (recent.length >= limit) { windows.set(key, recent); return false; }
  recent.push(now);
  windows.set(key, recent);
  return true;
}

function status() {
  const config = getAiConfig();
  return { enabled: config.enabled, configured: Boolean(config.apiKey), model: config.model, provider: "0G Private Computer" };
}

const FAILURE_COPY = {
  not_configured: "The AI agent is not configured for this deployment yet.",
  rate_limited: "The AI service is busy. Please try again in a moment.",
  timeout: "The AI service took too long to respond. Please try again.",
  unreachable: "The AI service is unreachable right now. Please try again later.",
  empty_output: "The AI service returned an empty answer. Please try again.",
};
const failureText = (error) => FAILURE_COPY[error.code] || "The AI agent could not answer this request. Please try again.";

async function postAgentMessage({ io, project, trigger, role, body, ai, review }) {
  const message = await ChatMessage.create({
    project: project._id,
    authorUid: AGENT_UID,
    authorName: "Bounty agent",
    body,
    replyTo: { id: trigger.id, author: trigger.authorName || "", snippet: String(trigger.body || "").slice(0, 120) },
    review: review ? review._id : undefined,
    agent: { role, triggerMessage: trigger.id, ...ai },
  });
  if (review) message.review = review; // already loaded; lets the serializer build the report without a query
  io?.to(`project:${project.id}`).emit("chat:message-created", messageResponse(message));
  return message;
}

function setWorking(io, project, working, role) {
  io?.to(`project:${project.id}`).emit("agent:status", { working, role: role || null });
}

async function runJob({ io, project, message, trigger, config }) {
  setWorking(io, project, true, trigger.role);
  const base = { id: message.id, body: message.body, authorName: message.authorName };
  try {
    if (!config.apiKey) throw new AiError("not configured", { code: "not_configured" });
    const context = await buildContext({ project, triggerMessage: message, question: trigger.question || message.body, config });
    const result = await chatCompletion({ messages: buildMessages({ role: trigger.role, ...context }) }, config);
    if (context.repo.error) console.warn("AI answered without repository context:", context.repo.error);
    // Reject answers that are cut off mid-generation rather than publishing a misleading partial.
    const suffix = result.finishReason === "length" ? "\n\n_(Answer was truncated.)_" : "";
    await postAgentMessage({
      io, project, trigger: base, role: trigger.role, body: result.text + suffix,
      ai: {
        status: "ok", requestId: result.requestId, model: result.model, contextHash: context.contextHash,
        repoSha: context.repo.sha, repoFiles: context.repo.files,
      },
    });
  } catch (error) {
    console.error("AI request failed:", error.code || "", error.message);
    await postAgentMessage({
      io, project, trigger: base, role: trigger.role, body: failureText(error),
      ai: { status: "error", errorCode: error.code || "ai_error" },
    });
  } finally {
    setWorking(io, project, false);
  }
}

const isMaintainer = (project, uid) =>
  project.owner?.firebaseUid === uid || (project.coOwners || []).some((user) => user.firebaseUid === uid);

function parseCriteria(raw) {
  const nl = String.fromCharCode(10);
  const bullet = new RegExp("^(?:[-*" + String.fromCharCode(8226) + "]|(?:c?" + String.fromCharCode(92) + "d{1,2}[.):-]))" + String.fromCharCode(92) + "s*", "i");
  return String(raw || "").split(nl).map((line) => line.trim().replace(bullet, "").trim()).filter(Boolean);
}

async function handleSetCriteria({ io, project, message, trigger }) {
  const base = { id: message.id, body: message.body, authorName: message.authorName };
  const say = (body, errorCode) => postAgentMessage({
    io, project, trigger: base, role: "scope", body, ai: errorCode ? { status: "error", errorCode } : { status: "ok" },
  });
  if (!isMaintainer(project, message.authorUid)) return say("Only the project owner or a co-owner can approve criteria.", "forbidden");
  const texts = parseCriteria(trigger.rawBody);
  if (!texts.length) return say("Add criteria after the command, one per line, for example:" + String.fromCharCode(10) + "`/setcriteria`" + String.fromCharCode(10) + "1. Disable the submit button while a request is pending", "empty_criteria");
  if (texts.length > 20 || texts.some((t) => t.length > 500)) return say("Use at most 20 criteria of up to 500 characters each.", "invalid_criteria");

  const items = texts.map((text, index) => ({ id: "c" + (index + 1), text }));
  const criteria = {
    items, version: (project.criteria?.version || 0) + 1,
    hash: crypto.createHash("sha256").update(JSON.stringify(items.map((i) => i.text))).digest("hex").slice(0, 16),
    approvedByUid: message.authorUid, approvedByName: message.authorName || "", approvedAt: new Date(),
  };
  await Project.updateOne({ _id: project._id }, { $set: { criteria } });
  project.criteria = criteria;
  return say("**Criteria approved (v" + criteria.version + ", " + criteria.hash + ")** by " + (message.authorName || "a maintainer") + ":" + String.fromCharCode(10) + items.map((i) => "- **" + i.id + "** " + i.text).join(String.fromCharCode(10)) + String.fromCharCode(10, 10) + "New reviews use these criteria. Run `/review <PR number>` to check a pull request.");
}

function reviewNotice(project, review, reused) {
  const owner = project.owner?.displayName ? "@" + project.owner.displayName.split(" ")[0] : "Maintainers";
  const nl = String.fromCharCode(10);
  const reasons = review.verdictReasons.map((r) => "- " + r).join(nl);
  const head = "**PR #" + review.prNumber + " (" + review.headSha.slice(0, 7) + "): " + VERDICTS[review.verdict] + "**";
  const reuse = reused ? nl + "_Reused the existing review for this commit; CI status was refreshed._" : "";
  if (review.verdict === "ready_for_approval") {
    return head + reuse + nl + reasons + nl + nl + owner + ", this looks ready for you. This is an advisory recommendation: please check the evidence, then decide on merge and any reward yourself.";
  }
  if (review.verdict === "changes_requested") {
    return head + reuse + nl + reasons + nl + nl + "The contributor should address these and push; run `/review " + review.prNumber + "` for a fresh review of the new commit.";
  }
  return head + reuse + nl + reasons + nl + nl + owner + ", this needs your attention before it can move forward.";
}

async function runReviewJob({ io, project, message, trigger, config }) {
  setWorking(io, project, true, "reviewer");
  const base = { id: message.id, body: message.body, authorName: message.authorName };
  try {
    const { review, reused } = await reviewPullRequest({
      project, prNumber: trigger.pr.number, requestedByUid: message.authorUid, force: trigger.pr.force, config,
    });
    await postAgentMessage({
      io, project, trigger: base, role: "reviewer", review,
      body: "Evidence report for PR #" + review.prNumber + ": " + VERDICTS[review.verdict] + ".",
      ai: { status: "ok", requestId: review.requestId, model: review.model, repoSha: review.headSha },
    });
    await postAgentMessage({
      io, project, trigger: base, role: "reviewer", body: reviewNotice(project, review, reused),
      ai: { status: "ok", repoSha: review.headSha },
    });
    io?.to("project:" + project.id).emit("review:completed", { reviewId: review.id, prNumber: review.prNumber, verdict: review.verdict });
  } catch (error) {
    console.error("PR review failed:", error.code || "", error.message);
    const known = error instanceof ReviewError || ["pr_not_found", "not_found", "private", "no_repo", "rate_limited", "bad_pr"].includes(error.code);
    await postAgentMessage({
      io, project, trigger: base, role: "reviewer",
      body: known && error.code !== "rate_limited" ? error.message : failureText(error),
      ai: { status: "error", errorCode: error.code || "review_error" },
    });
  } finally {
    setWorking(io, project, false);
  }
}

function enqueue(projectId, job) {
  let queue = queues.get(projectId);
  if (!queue) { queue = { running: false, jobs: [] }; queues.set(projectId, queue); }
  queue.jobs.push(job);
  if (queue.running) return;
  queue.running = true;
  (async () => {
    while (queue.jobs.length) {
      const next = queue.jobs.shift();
      try { await next(); } catch (error) { console.error("AI job crashed:", error.message); }
    }
    queue.running = false;
    queues.delete(projectId);
  })();
}

// Called after a human message is stored. Ordinary chat returns immediately without inference.
async function handleMessage({ io, project, message }) {
  const config = getAiConfig();
  if (!config.enabled || mongoose.connection.readyState !== 1) return;
  if (message.authorUid === AGENT_UID) return; // never react to the agent's own output

  let replyToIsAgent = false;
  if (message.replyTo?.id && mongoose.isValidObjectId(message.replyTo.id)) {
    replyToIsAgent = Boolean(await ChatMessage.exists({ _id: message.replyTo.id, project: project._id, authorUid: AGENT_UID }));
  }
  const trigger = detectTrigger({ body: message.body, replyToIsAgent });
  if (!trigger) return;

  const base = { id: message.id, body: message.body, authorName: message.authorName };
  const refuse = (body, errorCode) => postAgentMessage({
    io, project, trigger: base, role: trigger.role, body, ai: { status: "error", errorCode },
  });

  if (trigger.kind === "setcriteria") return void await handleSetCriteria({ io, project, message, trigger });
  if (trigger.pr?.repo && trigger.pr.repo.toLowerCase() !== (project.githubRepository?.fullName || "").toLowerCase()) {
    return void await refuse("That pull request belongs to a different repository than this project's (" + (project.githubRepository?.fullName || "none") + ").", "wrong_repo");
  }
  if (!trigger.question) {
    return void await postAgentMessage({
      io, project, trigger: base, role: trigger.role,
      body: "Add a question after the command, for example `/explain how does chat work?`.",
      ai: { status: "error", errorCode: "empty_question" },
    });
  }
  if (!allow(userWindows, `${project.id}:${message.authorUid}`, config.userRequestsPerMinute)
    || !allow(projectWindows, project.id, config.projectRequestsPerMinute)) {
    return void await refuse("You are asking the agent too quickly. Please wait a minute and try again.", "rate_limited");
  }
  const queue = queues.get(project.id);
  if (queue && queue.jobs.length >= config.maxQueueDepth) {
    return void await refuse("The agent has too many pending requests. Please try again shortly.", "queue_full");
  }
  const job = trigger.role === "reviewer" && trigger.pr ? runReviewJob : runJob;
  enqueue(project.id, () => job({ io, project, message, trigger, config }));
}

module.exports = { handleMessage, status, COMMANDS };
