const { listPublicArchive } = require("./githubArchive");

// Read-only access to a project's own public GitHub repository, pinned to a commit SHA.
// Only the repository saved on the Project (created group chat) is ever fetched, never user-supplied repos.
// GITHUB_TOKEN is optional (raises the API limit from 60/h); it is never put into prompts or responses.
const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const FILE_CACHE_MAX = 200;
const MAX_FILE_BYTES = 150 * 1024;
const MAX_SNAPSHOTS = 32;

const snapshots = new Map(); // fullName -> { at, value }
const snapshotLoads = new Map();
const fileCache = new Map(); // `${fullName}@${sha}:${path}` -> string
let apiRetryAt = 0;

class GithubError extends Error {
  constructor(message, code = "github_error") { super(message); this.code = code; }
}

function headers(accept = "application/vnd.github+json", token = process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_REVIEW_TOKEN?.trim()) {
  const h = { Accept: accept, "User-Agent": "OpenBounty-Agent", "X-GitHub-Api-Version": "2022-11-28" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function api(path, { method = "GET", body, token } = {}) {
  if (Date.now() < apiRetryAt) throw new GithubError("GitHub rate limit reached.", "rate_limited");
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { ...headers(undefined, token), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) throw new GithubError("The repository is not public or no longer exists.", "not_found");
  if (response.status === 403 || response.status === 429) {
    const retry = Number(response.headers.get("retry-after")) * 1000 || 0;
    const exhausted = response.headers.get("x-ratelimit-remaining") === "0";
    const reset = exhausted ? (Number(response.headers.get("x-ratelimit-reset")) || 0) * 1000 - Date.now() : 0;
    const message = await response.json().then((body) => String(body.message || "")).catch(() => "");
    if (response.status === 429 || exhausted || retry > 0 || /rate limit/i.test(message)) {
      apiRetryAt = Date.now() + Math.max(retry, reset, 60000);
      throw new GithubError("GitHub rate limit reached.", "rate_limited");
    }
    throw new GithubError("GitHub denied access to this resource.", "forbidden");
  }
  if (response.status === 401) throw new GithubError("GitHub rejected the server token.", "bad_token");
  if (!response.ok) throw new GithubError(`GitHub returned ${response.status}.`);
  return response.json();
}

// Paths the agent must never read or quote.
const BLOCKED_PATH = /(^|\/)(\.env[^/]*|.*\.(pem|key|p12|pfx|keystore)|id_rsa[^/]*|\.npmrc|\.git\/.*|node_modules\/.*|.*\.(lock|min\.js|map|svg|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp4|mp3)|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i;

function includeFile(path, size = 0) {
  return Boolean(path && !path.split("/").some((part) => !part || part === "." || part === "..")
    && !/[\\\u0000-\u001f]/.test(path) && !BLOCKED_PATH.test(path) && size <= MAX_FILE_BYTES);
}

async function getSnapshot(fullName) {
  if (!REPO_PATTERN.test(fullName || "")) throw new GithubError("This project has no valid GitHub repository.", "no_repo");
  const key = fullName.toLowerCase();
  const cached = snapshots.get(key);
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.value;
  if (snapshotLoads.has(key)) return snapshotLoads.get(key);
  const load = (async () => {
    let value;
    try {
      value = await loadApiSnapshot(fullName);
    } catch (error) {
      if (!["rate_limited", "bad_token", "forbidden"].includes(error.code)) throw error;
      try {
        value = await listPublicArchive(fullName, includeFile);
      } catch (archiveError) {
        throw new GithubError(`${error.message} ${archiveError.message}`, error.code);
      }
    }
    snapshots.delete(key);
    if (snapshots.size >= MAX_SNAPSHOTS) snapshots.delete(snapshots.keys().next().value);
    snapshots.set(key, { at: Date.now(), value });
    return value;
  })().finally(() => snapshotLoads.delete(key));
  snapshotLoads.set(key, load);
  return load;
}

async function loadApiSnapshot(fullName) {
  const repo = await api(`/repos/${fullName}`);
  if (repo.private) throw new GithubError("Private repositories are not supported.", "private");
  const commit = await api(`/repos/${fullName}/commits/${encodeURIComponent(repo.default_branch)}`);
  const sha = commit.sha;
  const tree = await api(`/repos/${fullName}/git/trees/${commit.commit?.tree?.sha || sha}?recursive=1`);
  const files = (tree.tree || [])
    .filter((entry) => entry.type === "blob" && entry.mode !== "120000" && includeFile(entry.path, entry.size))
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }));

  return {
    fullName: repo.full_name, branch: repo.default_branch, sha,
    description: repo.description || "", language: repo.language || "", topics: repo.topics || [],
    files, truncated: Boolean(tree.truncated),
  };
}

async function readFile(snapshot, path) {
  const key = `${snapshot.fullName}@${snapshot.sha}:${path}`;
  if (fileCache.has(key)) return fileCache.get(key);
  // raw.githubusercontent.com does not count against the REST API rate limit.
  const url = `https://raw.githubusercontent.com/${snapshot.fullName}/${snapshot.sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, { headers: { "User-Agent": "OpenBounty-Agent" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const text = await response.text();
  if (text.includes("\u0000") || Buffer.byteLength(text) > MAX_FILE_BYTES) return null;
  if (fileCache.size >= FILE_CACHE_MAX) fileCache.delete(fileCache.keys().next().value);
  fileCache.set(key, text);
  return text;
}

const STOP = new Set(["the", "and", "for", "how", "what", "does", "this", "that", "with", "from", "into", "are", "was",
  "can", "you", "agent", "explain", "review", "criteria", "work", "works", "about", "where", "which", "project", "code",
  "file", "files", "please", "tell", "show", "why", "who", "when", "any", "use", "used", "using", "read", "cite", "source"]);

function tokens(text) {
  return [...new Set(String(text || "").toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) || [])].filter((t) => !STOP.has(t));
}

function topicStems(question) {
  return tokens(question).map((term) => term.replace(/(?:ing|ers?|ed|s)$/, "")).filter((term) => term.length >= 4);
}

// Path-based relevance (no code search available without auth): mentioned paths, name matches, entry points, docs.
function pickFiles(snapshot, question, limit) {
  const q = tokens(question);
  const stems = topicStems(question);
  const mentioned = new Set((String(question).match(/[\w./-]+\.[A-Za-z0-9]{1,6}/g) || []).map((p) => p.toLowerCase()));
  const scored = snapshot.files.map((file) => {
    const lower = file.path.toLowerCase();
    const base = lower.split("/").pop();
    const depth = lower.split("/").length;
    let score = 0;
    if (/^readme(\.|$)/i.test(file.path)) score += 100;
    if (/^contributing(\.|$)/i.test(file.path)) score += 60;
    if (mentioned.has(lower) || [...mentioned].some((m) => lower.endsWith(`/${m}`) || base === m)) score += 250;
    for (const t of q) {
      if (base.includes(t)) score += 12;
      else if (lower.includes(t)) score += 5;
    }
    if (stems.some((term) => base.includes(term))) score += 35;
    if (score > 0 && /\.(py|js|jsx|ts|tsx|go|rs|sol|java|rb|php)$/.test(base)) score += 15;
    if (/^(package\.json|pyproject\.toml|go\.mod|cargo\.toml)$/.test(base) && depth <= 2) score += 20;
    if (/(^|\/)(server|app|main|index|routes|db)\.(js|jsx|ts|tsx|py|go|rs)$/.test(lower)) score += 8;
    if (q.includes("api") && /^(main|server|app|routes)\.(py|js|ts|go|rs)$/.test(base)) score += 30;
    if (q.some((term) => ["database", "persistence", "storage"].includes(term))
      && /^(db|database|models|schema)\.(py|js|ts|go|rs)$/.test(base)) score += 30;
    if (/\.(md|mdx)$/.test(lower) && depth <= 2) score += 6;
    if (/(^|\/)tests?\/|(^|\/)test_|\.(test|spec)\./.test(lower)) score -= 45;
    return { ...file, score: score - depth * 0.5 };
  }).filter((f) => f.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

function excerpt(content, question, limit) {
  if (content.length <= limit) return { body: content, start: 1, truncated: false };
  const stems = topicStems(question);
  const lines = content.split("\n");
  let best = { line: 0, score: 0 };
  for (const [index, line] of lines.entries()) {
    const lower = line.toLowerCase();
    const matches = stems.filter((term) => lower.includes(term)).length;
    if (!matches) continue;
    const declaration = /^\s*(?:(?:async\s+)?(?:def|function)|class)\s+/.test(line);
    const score = matches + (declaration ? 2 : 0);
    if (score > best.score) best = { line: index, score };
  }
  const start = Math.max(0, best.line - 5);
  return { body: lines.slice(start).join("\n").slice(0, limit), start: start + 1, truncated: true };
}

function treeSummary(snapshot, maxPaths = 250) {
  const paths = snapshot.files.map((f) => f.path).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  const shown = paths.slice(0, maxPaths);
  const more = paths.length - shown.length;
  return shown.join("\n") + (more > 0 || snapshot.truncated ? `\n… (${more > 0 ? `${more} more paths, ` : ""}listing may be incomplete)` : "");
}

// Returns text for the prompt plus the pinned SHA and the files included.
async function buildRepoContext(fullName, question, { maxChars = 16000, maxFiles = 6, perFileChars = 5000 } = {}) {
  const snapshot = await getSnapshot(fullName);
  let budget = maxChars;
  const included = [];
  const blocks = [];
  const candidates = pickFiles(snapshot, question, maxFiles);
  const results = await Promise.allSettled(candidates.map((file) => readFile(snapshot, file.path)));
  for (const [index, result] of results.entries()) {
    if (budget <= 500) break;
    if (result.status !== "fulfilled" || result.value == null) continue;
    const content = result.value;
    const file = candidates[index];
    const take = Math.min(perFileChars, budget);
    const { body, start, truncated } = excerpt(content, question, take);
    budget -= body.length;
    included.push(file.path);
    blocks.push(`--- FILE ${file.path} (@${snapshot.sha.slice(0, 7)})${truncated ? ` [excerpt starting at line ${start}]` : ""}\n${body}`);
  }
  const text = [
    `Repository: ${snapshot.fullName} (default branch${snapshot.branch ? ` ${snapshot.branch}` : ""}, pinned commit ${snapshot.sha})`,
    snapshot.description && `Repository description: ${snapshot.description}`,
    snapshot.language && `Primary language: ${snapshot.language}`,
    `File tree at the pinned commit:\n${treeSummary(snapshot)}`,
    blocks.length ? `Included file contents (only these files were read):\n${blocks.join("\n\n")}` : "No file contents were included.",
  ].filter(Boolean).join("\n\n");
  return { text, sha: snapshot.sha, branch: snapshot.branch, files: included };
}


// ---- Pull requests -------------------------------------------------------------------------------------------

const MAX_PR_FILES = 100;

function summarizeCi(checkRuns, combinedStatus) {
  const runs = (checkRuns?.check_runs || []).map((run) => ({
    name: String(run.name || "check").slice(0, 100),
    status: run.status,
    conclusion: run.conclusion || "",
    url: run.html_url || "",
  }));
  const statuses = (combinedStatus?.statuses || []).map((item) => ({
    name: String(item.context || "status").slice(0, 100),
    status: item.state === "pending" ? "in_progress" : "completed",
    conclusion: item.state === "success" ? "success" : item.state === "pending" ? "" : "failure",
    url: item.target_url || "",
  }));
  const all = [...runs, ...statuses];
  const bad = ["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"];
  let state = "none";
  if (all.length) {
    if (all.some((r) => bad.includes(r.conclusion))) state = "failure";
    else if (all.some((r) => r.status !== "completed")) state = "pending";
    else if (all.every((r) => ["success", "neutral", "skipped"].includes(r.conclusion))) state = "success";
    else state = "pending";
  }
  return { state, runs: all.slice(0, 30) };
}

// Fetches PR metadata, changed files with patches, and CI results, all tied to the PR's head SHA.
async function fetchPullRequest(fullName, number) {
  if (!REPO_PATTERN.test(fullName || "")) throw new GithubError("This project has no valid GitHub repository.", "no_repo");
  if (!Number.isInteger(number) || number < 1) throw new GithubError("Invalid pull request number.", "bad_pr");
  const pr = await api(`/repos/${fullName}/pulls/${number}`).catch((error) => {
    if (error.code === "not_found") throw new GithubError(`Pull request #${number} was not found in ${fullName}.`, "pr_not_found");
    throw error;
  });
  if (pr.base?.repo?.private) throw new GithubError("Private repositories are not supported.", "private");
  const sha = pr.head?.sha;
  const [filesPage, checkRuns, combined] = await Promise.all([
    api(`/repos/${fullName}/pulls/${number}/files?per_page=${MAX_PR_FILES}`),
    api(`/repos/${fullName}/commits/${sha}/check-runs?per_page=100`).catch(() => null),
    api(`/repos/${fullName}/commits/${sha}/status`).catch(() => null),
  ]);
  return {
    number: pr.number,
    url: pr.html_url,
    title: pr.title || "",
    body: pr.body || "",
    author: pr.user?.login || "",
    state: pr.merged ? "merged" : pr.state, // open | closed | merged
    draft: Boolean(pr.draft),
    headSha: sha,
    baseBranch: pr.base?.ref || "",
    changedFiles: pr.changed_files ?? filesPage.length,
    additions: pr.additions ?? 0,
    deletions: pr.deletions ?? 0,
    files: filesPage.map((f) => ({
      path: f.filename, status: f.status, additions: f.additions, deletions: f.deletions,
      patch: BLOCKED_PATH.test(f.filename) ? "" : (f.patch || ""),
    })),
    filesTruncated: (pr.changed_files ?? 0) > filesPage.length,
    ci: summarizeCi(checkRuns, combined),
  };
}

// Cheap freshness probe used right before publishing a review.
async function fetchPullRequestHead(fullName, number) {
  const pr = await api(`/repos/${fullName}/pulls/${number}`);
  return { headSha: pr.head?.sha, state: pr.merged ? "merged" : pr.state };
}

// Issue numbers a PR body links with GitHub closing keywords ("Fixes #12", "closes owner/repo#12"), same repo only.
function linkedIssueNumbers(text, fullName, limit = 3) {
  const numbers = [];
  const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d{1,7})\b/gi;
  for (const match of String(text || "").matchAll(pattern)) {
    if (match[1] && match[1].toLowerCase() !== String(fullName || "").toLowerCase()) continue;
    const number = Number(match[2]);
    if (number > 0 && !numbers.includes(number)) numbers.push(number);
    if (numbers.length >= limit) break;
  }
  return numbers;
}

// Reads one issue (or PR conversation) of the project's public repository as untrusted context.
async function fetchIssue(fullName, number) {
  if (!REPO_PATTERN.test(fullName || "")) throw new GithubError("This project has no valid GitHub repository.", "no_repo");
  if (!Number.isInteger(number) || number < 1) throw new GithubError("Invalid issue number.", "bad_issue");
  const issue = await api(`/repos/${fullName}/issues/${number}`);
  return {
    number: issue.number,
    kind: issue.pull_request ? "pull request" : "issue",
    title: String(issue.title || "").slice(0, 300),
    body: String(issue.body || "").slice(0, 4000),
    state: issue.state || "",
    url: issue.html_url || "",
    labels: (issue.labels || []).map((label) => String(label?.name || label || "").slice(0, 50)).filter(Boolean).slice(0, 10),
  };
}

async function fetchLinkedIssues(fullName, text) {
  const results = await Promise.allSettled(linkedIssueNumbers(text, fullName).map((number) => fetchIssue(fullName, number)));
  return results.filter((result) => result.status === "fulfilled" && result.value.kind === "issue").map((result) => result.value);
}

function reviewRepositoryEnabled(fullName) {
  if (!REPO_PATTERN.test(fullName || "")) return false;
  return (process.env.GITHUB_REVIEW_REPOSITORIES || "").split(",")
    .some((repo) => repo.trim().toLowerCase() === fullName.toLowerCase());
}

async function upsertReviewComment(fullName, number, marker, text, previousId) {
  const token = process.env.GITHUB_REVIEW_TOKEN?.trim();
  if (!token || !reviewRepositoryEnabled(fullName)) return null;
  const path = `/repos/${fullName}/issues`;
  const body = { body: `${marker}\n${text}` };
  if (previousId) {
    try {
      return await api(`${path}/comments/${previousId}`, { method: "PATCH", body, token });
    } catch (error) {
      if (error.code !== "not_found") throw error;
    }
  }
  // Recover an already-created comment if the first response was lost.
  const viewer = await api("/user", { token });
  const comments = await api(`${path}/${number}/comments?per_page=100&sort=created&direction=desc`, { token });
  const ownComment = comments.find((comment) => comment.user?.id === viewer.id && comment.body?.startsWith(marker + "\n"));
  if (ownComment) return api(`${path}/comments/${ownComment.id}`, { method: "PATCH", body, token });
  return api(`${path}/${number}/comments`, { method: "POST", body, token });
}

module.exports = { fetchPullRequest, fetchPullRequestHead, fetchIssue, fetchLinkedIssues, linkedIssueNumbers, upsertReviewComment, reviewRepositoryEnabled, summarizeCi, buildRepoContext, getSnapshot, pickFiles, GithubError, REPO_PATTERN };
