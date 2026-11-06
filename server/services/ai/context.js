const crypto = require("node:crypto");
const ChatMessage = require("../../models/ChatMessage");

const { AGENT_UID } = require("../chatSerializer");
const { buildRepoContext } = require("../github");

// Remove obvious secrets before anything reaches a prompt.
const SECRET_PATTERNS = [
  /\b(?:sk|mk|ghp|gho|ghs|github_pat)[-_][A-Za-z0-9_]{16,}\b/g,
  /\b0x[a-fA-F0-9]{64}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];
const redact = (text) => SECRET_PATTERNS.reduce((out, re) => out.replace(re, "[redacted]"), String(text || ""));

function projectFacts(project) {
  const repo = project.githubRepository || {};
  return [
    `Project: ${project.name}`,
    project.description ? `Description: ${project.description}` : "",
    repo.fullName ? `Connected repository: ${repo.fullName}${repo.url ? ` (${repo.url})` : ""}` : "No repository connected.",
  ].filter(Boolean).join("\n");
}

// Builds the bounded, versioned context package for one invocation.
async function buildContext({ project, triggerMessage, question, config }) {
  const recent = await ChatMessage.find({ project: project._id, _id: { $lt: triggerMessage._id } })
    .sort({ _id: -1 }).limit(config.maxHistoryMessages).lean();

  let budget = config.maxContextChars;
  const history = [];
  for (const message of recent) {
    const body = redact(message.body).slice(0, 1500);
    if (!body.trim()) continue;
    budget -= body.length;
    if (budget < 0) break;
    history.unshift({
      author: message.authorUid === AGENT_UID ? "Agent" : (message.authorName || "User"),
      body,
    });
  }

  // Repository content is fetched at a pinned commit; a GitHub failure degrades to a labelled gap, never a guess.
  let repo = { sha: "", files: [], error: "" };
  let repoText = "";
  if (project.githubRepository?.fullName) {
    try {
      const built = await buildRepoContext(project.githubRepository.fullName, question, {
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

  const facts = `${redact(projectFacts(project))}

${repoText}`;
  const cleanQuestion = redact(question).slice(0, 4000);
  const contextHash = crypto.createHash("sha256")
    .update(JSON.stringify({ facts, history, question: cleanQuestion, sha: repo.sha })).digest("hex").slice(0, 16);
  return { projectFacts: facts, history, question: cleanQuestion, contextHash, repo };
}

module.exports = { AGENT_UID, buildContext, redact };
