// Read-only access to a project's own public GitHub repository, pinned to a commit SHA.
// Only the repository saved on the Project (created group chat) is ever fetched, never user-supplied repos.
// GITHUB_TOKEN is optional (raises the API limit from 60/h); it is never put into prompts or responses.
const REPO_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const SNAPSHOT_TTL_MS = 5 * 60 * 1000;
const FILE_CACHE_MAX = 200;
const MAX_FILE_BYTES = 150 * 1024;

const snapshots = new Map(); // fullName -> { at, value }
const fileCache = new Map(); // `${fullName}@${sha}:${path}` -> string

class GithubError extends Error {
  constructor(message, code = "github_error") { super(message); this.code = code; }
}

function headers(accept = "application/vnd.github+json") {
  const h = { Accept: accept, "User-Agent": "OpenBounty-Agent", "X-GitHub-Api-Version": "2022-11-28" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers: headers(), signal: AbortSignal.timeout(10000) });
  if (response.status === 404) throw new GithubError("The repository is not public or no longer exists.", "not_found");
  if (response.status === 403 || response.status === 429) throw new GithubError("GitHub rate limit reached.", "rate_limited");
  if (!response.ok) throw new GithubError(`GitHub returned ${response.status}.`);
  return response.json();
}

// Paths the agent must never read or quote.
const BLOCKED_PATH = /(^|\/)(\.env[^/]*|.*\.(pem|key|p12|pfx|keystore)|id_rsa[^/]*|\.npmrc|\.git\/.*|node_modules\/.*|.*\.(lock|min\.js|map|svg|png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|mp4|mp3)|package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i;

async function getSnapshot(fullName) {
  if (!REPO_PATTERN.test(fullName || "")) throw new GithubError("This project has no valid GitHub repository.", "no_repo");
  const key = fullName.toLowerCase();
  const cached = snapshots.get(key);
  if (cached && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.value;

  const repo = await api(`/repos/${fullName}`);
  if (repo.private) throw new GithubError("Private repositories are not supported.", "private");
  const commit = await api(`/repos/${fullName}/commits/${encodeURIComponent(repo.default_branch)}`);
  const sha = commit.sha;
  const tree = await api(`/repos/${fullName}/git/trees/${sha}?recursive=1`);
  const files = (tree.tree || [])
    .filter((entry) => entry.type === "blob" && !BLOCKED_PATH.test(entry.path) && (entry.size ?? 0) <= MAX_FILE_BYTES)
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }));

  const value = {
    fullName: repo.full_name, branch: repo.default_branch, sha,
    description: repo.description || "", language: repo.language || "", topics: repo.topics || [],
    files, truncated: Boolean(tree.truncated),
  };
  snapshots.set(key, { at: Date.now(), value });
  return value;
}

async function readFile(snapshot, path) {
  const key = `${snapshot.fullName}@${snapshot.sha}:${path}`;
  if (fileCache.has(key)) return fileCache.get(key);
  // raw.githubusercontent.com does not count against the REST API rate limit.
  const url = `https://raw.githubusercontent.com/${snapshot.fullName}/${snapshot.sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(url, { headers: { "User-Agent": "OpenBounty-Agent" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) return null;
  const text = await response.text();
  if (text.includes("\u0000")) return null; // binary
  if (fileCache.size >= FILE_CACHE_MAX) fileCache.delete(fileCache.keys().next().value);
  fileCache.set(key, text);
  return text;
}

const STOP = new Set(["the", "and", "for", "how", "what", "does", "this", "that", "with", "from", "into", "are", "was",
  "can", "you", "agent", "explain", "review", "criteria", "work", "works", "about", "where", "which", "project", "code",
  "file", "files", "please", "tell", "show", "why", "who", "when", "any", "use", "used", "using"]);

function tokens(text) {
  return [...new Set(String(text || "").toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) || [])].filter((t) => !STOP.has(t));
}

// Path-based relevance (no code search available without auth): mentioned paths, name matches, entry points, docs.
function pickFiles(snapshot, question, limit) {
  const q = tokens(question);
  const mentioned = new Set((String(question).match(/[\w./-]+\.[A-Za-z0-9]{1,6}/g) || []).map((p) => p.toLowerCase()));
  const scored = snapshot.files.map((file) => {
    const lower = file.path.toLowerCase();
    const base = lower.split("/").pop();
    const depth = lower.split("/").length;
    let score = 0;
    if (/^readme(\.|$)/i.test(file.path)) score += 100;
    if (/^contributing(\.|$)/i.test(file.path)) score += 60;
    if (mentioned.has(lower) || [...mentioned].some((m) => lower.endsWith(`/${m}`) || base === m)) score += 120;
    for (const t of q) {
      if (base.includes(t)) score += 12;
      else if (lower.includes(t)) score += 5;
    }
    if (/^(package\.json|pyproject\.toml|go\.mod|cargo\.toml)$/.test(base) && depth <= 2) score += 20;
    if (/(^|\/)(server|app|main|index)\.(js|jsx|ts|tsx|py|go|rs)$/.test(lower)) score += 8;
    if (/\.(md|mdx)$/.test(lower) && depth <= 2) score += 6;
    if (/\.(test|spec)\./.test(lower)) score -= 4;
    return { ...file, score: score - depth * 0.5 };
  }).filter((f) => f.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
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
  for (const file of pickFiles(snapshot, question, maxFiles)) {
    if (budget <= 500) break;
    const content = await readFile(snapshot, file.path);
    if (content == null) continue;
    const take = Math.min(perFileChars, budget);
    const body = content.slice(0, take);
    budget -= body.length;
    included.push(file.path);
    blocks.push(`--- FILE ${file.path} (@${snapshot.sha.slice(0, 7)})${content.length > take ? " [truncated]" : ""}\n${body}`);
  }
  const text = [
    `Repository: ${snapshot.fullName} (default branch ${snapshot.branch}, pinned commit ${snapshot.sha})`,
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

module.exports = { fetchPullRequest, fetchPullRequestHead, summarizeCi, buildRepoContext, getSnapshot, pickFiles, GithubError, REPO_PATTERN };
