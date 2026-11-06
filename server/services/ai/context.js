const crypto = require("node:crypto");
const ChatMessage = require("../../models/ChatMessage");

const { AGENT_UID } = require("../chatSerializer");
const Review = require("../../models/Review");
const { buildRepoContext, fetchIssue } = require("../github");
const { detectTrigger } = require("./triggers");

const RETRY = /^(?:(?:please\s+)?(?:try again|retry|try once more)|again)[.!?]*$/i;

function resolveQuestion(question, recent, authorUid) {
  if (!RETRY.test(question.trim())) return question;
  for (const message of recent) {
    if (message.authorUid !== authorUid) continue;
    const trigger = detectTrigger({ body: message.body });
    if (trigger?.role === "guide" && trigger.question && !RETRY.test(trigger.question)) return trigger.question;
  }
  return question;
}

// Remove obvious secrets before anything reaches a prompt.
const SECRET_PATTERNS = [
  /\b(?:sk|mk|ghp|gho|ghs|github_pat)[-_][A-Za-z0-9_]{16,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
// A 0x + 64 hex value is a private key only when its line says so. Hashes, curve constants and typehashes in
// real code (for example HALF_N) must stay readable or the reviewer cannot verify them.
const HEX64 = /\b0x[a-fA-F0-9]{64}\b/g;
const KEY_CONTEXT = /priv(?:ate)?[\s_-]*key|secret|mnemonic|seed|passw|credential|api[\s_-]*key|auth[\s_-]*token|signer[\s_-]*key|\bkey\s*[:=]/i;
function redact(text) {
  const base = SECRET_PATTERNS.reduce((out, re) => out.replace(re, "[redacted]"), String(text || ""));
  return base.replace(/^.*\b0x[a-fA-F0-9]{64}\b.*$/gm, (line) => (KEY_CONTEXT.test(line) ? line.replace(HEX64, "[redacted]") : line));
}

function projectFacts(project) {
  const repo = project.githubRepository || {};
  return [
    `Project: ${project.name}`,
    project.description ? `Description: ${project.description}` : "",
    repo.fullName ? `Connected repository: ${repo.fullName}${repo.url ? ` (${repo.url})` : ""}` : "No repository connected.",
  ].filter(Boolean).join("\n");
}

// "#12", "PR 12", "issue 12", "pull request #12": numbers a question refers to (max 2).
function referencedNumbers(text, limit = 2) {
  const numbers = [];
  const pattern = /(?:^|[\s(])(?:#|(?:pr|pull request|issue)\s*#?)(\d{1,7})\b/gi;
  for (const match of String(text || "").matchAll(pattern)) {
    const number = Number(match[1]);
    if (number > 0 && !numbers.includes(number)) numbers.push(number);
    if (numbers.length >= limit) break;
  }
  return numbers;
}

const STATUS_LABEL = { supported: "supported", missing: "missing", needs_verification: "needs verification" };

function reviewEvidenceText(review, currentCriteria) {
  const stale = review.status === "stale" || review.criteriaVersion !== (currentCriteria?.version || 0);
  const rows = (review.results || []).map((row) => {
    const cites = (row.citations || []).map((c) => `${c.path} L${c.startLine}-${c.endLine}`).join(", ");
    return `- ${row.id} (${STATUS_LABEL[row.status] || row.status}): ${row.text} — ${row.explanation}${cites ? ` [${cites}]` : ""}`;
  });
  return [
    `Latest OpenBounty evidence report for PR #${review.prNumber} "${review.prTitle}" at commit ${review.headSha.slice(0, 7)}`
      + ` (criteria v${review.criteriaVersion}${stale ? ", STALE: a newer commit or criteria exist" : ""}; 0G request ${review.requestId || "none"}).`,
    `Recommendation: ${review.verdict}. ${(review.verdictReasons || []).join(" ")}`,
    `CI: ${review.ci?.state || "none"}.`,
    review.summary && `Summary: ${review.summary}`,
    ...rows,
    review.uncertainty && `Uncertainty: ${review.uncertainty}`,
  ].filter(Boolean).join("\n");
}

// Adds the stored review (preferred) or the GitHub issue/PR conversation for numbers the question mentions.
async function referenceContext(project, question, maxChars) {
  const blocks = [];
  const references = [];
  for (const number of referencedNumbers(question)) {
    const review = await Review.findOne({ project: project._id, prNumber: number }).sort({ createdAt: -1, _id: -1 }).lean();
    if (review) {
      blocks.push(reviewEvidenceText(review, project.criteria));
      references.push({ kind: "review", number });
      continue;
    }
    if (!project.githubRepository?.fullName) continue;
    const issue = await fetchIssue(project.githubRepository.fullName, number).catch(() => null);
    if (!issue) continue;
    blocks.push(`GitHub ${issue.kind} #${issue.number} "${issue.title}" (${issue.state})${issue.labels.length ? ` labels: ${issue.labels.join(", ")}` : ""}\n${issue.body}`);
    references.push({ kind: issue.kind === "issue" ? "issue" : "pull_request", number });
  }
  return { text: redact(blocks.join("\n\n")).slice(0, maxChars), references };
}

// Builds the bounded, versioned context package for one invocation.
// Without a trigger message (API-initiated drafts), the latest thread messages are used.
async function buildContext({ project, triggerMessage, question, config }) {
  const historyFilter = { project: project._id, ...(triggerMessage?._id ? { _id: { $lt: triggerMessage._id } } : {}) };
  const recent = await ChatMessage.find(historyFilter).sort({ _id: -1 }).limit(config.maxHistoryMessages).lean();
  const cleanQuestion = redact(resolveQuestion(String(question || ""), recent, triggerMessage?.authorUid)).slice(0, 4000);

  let budget = config.maxContextChars;
  const history = [];
  for (const message of recent) {
    const body = redact(message.body).slice(0, 1500);
    if (!body.trim()) continue;
    budget -= body.length;
    if (budget < 0) break;
    history.unshift({
      author: message.authorUid === AGENT_UID ? "Agent" : String(message.authorName || "User").replace(/[\r\n<>]+/g, " ").slice(0, 60),
      body,
    });
  }

  // Repository content is fetched at a pinned commit; a GitHub failure degrades to a labelled gap, never a guess.
  let repo = { sha: "", files: [], error: "" };
  let repoText = "";
  if (project.githubRepository?.fullName) {
    try {
      const built = await buildRepoContext(project.githubRepository.fullName, cleanQuestion, {
        maxChars: Math.floor(config.maxContextChars * 0.7),
      });
      repo = { sha: built.sha, files: built.files, error: "" };
      repoText = redact(built.text);
    } catch (error) {
      repo.error = error.code || "github_error";
      repoText = `Repository content could not be loaded (${error.message}). Do not claim to have read any code; say the repository is unavailable.`;
    }
  } else {
    repoText = "No repository content is available because this project has no connected repository.";
  }

  const refs = await referenceContext(project, cleanQuestion, Math.floor(config.maxContextChars * 0.25));
  const criteria = project.criteria?.items?.length
    ? `Approved acceptance criteria (v${project.criteria.version}):\n${project.criteria.items.map((c) => `${c.id}: ${c.text}`).join("\n")}`
    : "No acceptance criteria have been approved yet.";
  const facts = [redact(projectFacts(project)), redact(criteria), refs.text, repoText].filter(Boolean).join("\n\n");
  const contextHash = crypto.createHash("sha256")
    .update(JSON.stringify({ facts, history, question: cleanQuestion, sha: repo.sha })).digest("hex").slice(0, 16);
  return { projectFacts: facts, history, question: cleanQuestion, contextHash, repo, references: refs.references };
}

module.exports = { AGENT_UID, buildContext, redact, referencedNumbers };
