// Regression tests for the bugs found in the track1 review. Offline: GitHub, 0G and Firebase are stubbed.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const express = require("express");
const mongoose = require("mongoose");

const realFetch = global.fetch;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

test("redaction hides keys but keeps hashes and constants readable", () => {
  const { redact } = require("../services/ai/context");
  const hex = `0x${"7f".repeat(32)}`;
  assert.match(redact(`uint256 constant HALF_N = ${hex};`), new RegExp(hex));
  assert.doesNotMatch(redact(`PRIVATE_KEY=${hex}`), new RegExp(hex));
  assert.doesNotMatch(redact(`const secret = "${hex}"`), new RegExp(hex));
  assert.match(redact("token ghp_abcdefghijklmnopqrstuvwxyz0123"), /\[redacted\]/);
});

test("criteria lines keep numbers that are part of the text", () => {
  const { parseCriteria } = require("../services/criteria");
  assert.deepEqual(parseCriteria("1.5x faster\n-5% error rate\n2. Numbered\n- Dash\n• Dot"),
    ["1.5x faster", "-5% error rate", "Numbered", "Dash", "Dot"]);
});

test("triggers: explicit PR references only, correct role, no spend on pleasantries", () => {
  const { detectTrigger } = require("../services/ai/triggers");
  const pr = (body) => detectTrigger({ body })?.pr?.number;
  assert.equal(pr("/review fix 404 handling"), undefined);
  assert.equal(pr("/review please"), undefined);
  assert.equal(pr("/review 12"), 12);
  assert.equal(pr("/review #12 force"), 12);
  assert.equal(pr("/review https://github.com/a/b/pull/9"), 9);
  const mention = detectTrigger({ body: "@agent review PR 5 against the criteria" });
  assert.equal(mention.role, "reviewer");
  assert.equal(mention.pr.number, 5);
  assert.equal(detectTrigger({ body: "@agent draft criteria for the form" }).role, "scope");
  assert.equal(detectTrigger({ body: "thanks!", replyToIsAgent: true }), null);
  assert.equal(detectTrigger({ body: "Thank you so much", replyToIsAgent: true }), null);
  assert.equal(detectTrigger({ body: "why is the build slow?", replyToIsAgent: true }).role, "guide");
});

test("citations to unchanged context lines cannot support a criterion", () => {
  const { validateReport } = require("../services/review/validate");
  const shownDiff = [{ path: "a.js", text: "@@ -1,3 +1,4 @@\nL1  const a = 1;\nL2+ if (pending) return;\nL3  save();" }];
  const criteria = [{ id: "c1", text: "x" }, { id: "c2", text: "y" }];
  const report = (citation) => validateReport({ criteria: [
    { id: "c1", status: "supported", explanation: "e", citations: [citation] },
    { id: "c2", status: "supported", explanation: "e", citations: [{ path: "a.js", startLine: 2, endLine: 2 }] },
  ] }, { criteria, shownDiff }).report.criteria;
  const [context, changed] = report({ path: "a.js", startLine: 1, endLine: 1 });
  assert.equal(context.status, "needs_verification");
  assert.match(context.explanation, /unchanged context/);
  assert.equal(changed.status, "supported");
});

test("diff budget keeps room for tests next to a huge source change", () => {
  const { buildDiffBudget } = require("../services/review/diff");
  const patch = (lines) => `@@ -1,1 +1,${lines} @@\n${Array.from({ length: lines }, (_, i) => `+line ${i} of the change`).join("\n")}`;
  const files = [
    { path: "src/big.js", patch: patch(2000), additions: 2000, deletions: 0 },
    { path: "src/big.test.js", patch: patch(20), additions: 20, deletions: 0 },
  ];
  const { included } = buildDiffBudget(files, 8000);
  assert.ok(included.some((file) => file.path === "src/big.test.js" && !file.partial), "test file is shown in full");
});

test("chat and PR comment text is neutralized", () => {
  const { plainText } = require("../services/bounties/notify");
  const out = plainText("Fix [x](http://evil.test) @owner <b>hi</b>\n# heading");
  assert.doesNotMatch(out, /\n|<b>|\]\(|@owner/);
  const { commentBody } = require("../services/review/publish");
  const body = commentBody({ verdict: "changes_requested", ci: { state: "none" }, headSha: "a".repeat(40), criteriaVersion: 1, reportHash: "h",
    requestId: "r", model: "m", summary: "see https://evil.test and www.evil.test @owner", results: [] });
  assert.doesNotMatch(body, /https:\/\/evil\.test|\bwww\.evil|@owner/);
});

test("chain config parses limits safely", () => {
  const { getChainConfig } = require("../config/chain");
  assert.equal(getChainConfig({}).sponsor.dailyBudgetWei, 500000000000000000n);
  assert.equal(getChainConfig({ SPONSOR_DAILY_BUDGET_WEI: "" }).sponsor.dailyBudgetWei, 500000000000000000n);
  assert.equal(getChainConfig({ SPONSOR_DAILY_BUDGET_WEI: "0.5" }).sponsor.dailyBudgetWei, 500000000000000000n);
  assert.equal(getChainConfig({ SPONSOR_DAILY_BUDGET_WEI: "7" }).sponsor.dailyBudgetWei, 7n);
});

test("0G failures are classified, logged without prompts, and deterministic ones are not retried", async (t) => {
  const { chatCompletion } = require("../services/ai/zeroG");
  const config = { apiKey: "k", baseUrl: "http://zerog.test", model: "m", maxRetries: 2, timeoutMs: 1000, maxOutputTokens: 10 };
  t.after(() => { global.fetch = realFetch; });
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  t.after(() => { console.error = originalError; });
  for (const [status, body, code] of [[401, {}, "ai_auth"], [402, {}, "ai_credits"], [400, {}, "ai_bad_request"], [503, { error: { code: "no_provider_for_trust_mode" } }, "upstream_error"]]) {
    let calls = 0;
    global.fetch = async () => { calls += 1; return json(body, status); };
    await assert.rejects(chatCompletion({ messages: [{ role: "user", content: "SECRET PROMPT" }] }, config), (error) => error.code === code);
    assert.equal(calls, 1, `${status} is not retried`);
  }
  assert.ok(errors.some((line) => line.includes("HTTP 402")));
  assert.ok(errors.every((line) => !line.includes("SECRET PROMPT")));
  let attempts = 0;
  global.fetch = async () => { attempts += 1; return json({}, 502); };
  await assert.rejects(chatCompletion({ messages: [] }, { ...config, maxRetries: 1 }), (error) => error.code === "upstream_error");
  assert.equal(attempts, 2, "a transient 502 is retried");
});

test("rate limiter blocks bursts and prunes keys", () => {
  const { createLimiter } = require("../services/rateLimit");
  const allowed = createLimiter({ windowMs: 1000, limit: 2, maxKeys: 3 });
  assert.deepEqual([allowed("a", 0), allowed("a", 1), allowed("a", 2), allowed("a", 1500)], [true, true, false, true]);
});

test("GitHub identity is bound to the verified login; stale approvals are cleared", async (t) => {
  const { MongoMemoryServer } = require("mongodb-memory-server");
  const mongo = await MongoMemoryServer.create();
  t.after(async () => { global.fetch = realFetch; await mongoose.disconnect(); await mongo.stop(); });
  await mongoose.connect(mongo.getUri());

  // Firebase is stubbed: the "token" is a key into this table of already-verified claims.
  const claims = {
    alice: { uid: "alice-uid", firebase: { sign_in_provider: "github.com", identities: { "github.com": ["111"] } } },
    bob: { uid: "bob-uid", firebase: { sign_in_provider: "github.com", identities: { "github.com": ["222"] } } },
    clone: { uid: "clone-uid", firebase: { sign_in_provider: "github.com", identities: { "github.com": ["111"] } } },
    noid: { uid: "noid-uid", firebase: { sign_in_provider: "github.com" } },
  };
  const adminPath = require.resolve("../config/firebaseAdmin");
  require.cache[adminPath] = { id: adminPath, filename: adminPath, loaded: true,
    exports: { getFirebaseAuth: () => ({ verifyIdToken: async (token) => { if (!claims[token]) throw new Error("bad token"); return claims[token]; } }) } };

  let githubMode = "ok";
  const accounts = { 111: { id: 111, login: "alice", html_url: "u", avatar_url: "a" }, 222: { id: 222, login: "bob", html_url: "u", avatar_url: "a" } };
  global.fetch = async (url, options) => {
    const href = String(url);
    if (href.startsWith("http://127.0.0.1")) return realFetch(url, options);
    const user = href.match(/api\.github\.com\/user\/(\d+)$/);
    if (user) return githubMode === "limited" ? json({ message: "rate limit" }, 403, { "x-ratelimit-remaining": "0" }) : json(accounts[user[1]] || {}, accounts[user[1]] ? 200 : 404);
    return json({}, 404);
  };

  const app = express();
  app.use(express.json());
  app.use("/api/me", require("../routes/me"));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const put = (token, username) => realFetch(`http://127.0.0.1:${server.address().port}/api/me/github`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ username }),
  });

  await require("../models/User").init(); // wait for the unique github.id index
  assert.equal((await put("alice", "alice")).status, 200);
  assert.equal((await put("alice", "bob")).status, 403, "cannot save someone else's username");
  assert.equal((await put("bob", "alice")).status, 403, "cannot take another account's name");
  assert.equal((await put("noid", "alice")).status, 403, "no verified GitHub id, no profile");
  assert.equal((await put("clone", "alice")).status, 409, "one GitHub account links to one user");
  githubMode = "limited";
  assert.equal((await put("alice", "alice")).status, 503, "a GitHub rate limit is reported as such");
  const User = require("../models/User");
  assert.equal((await User.findOne({ firebaseUid: "alice-uid" })).github.id, "111");

  // Stale approval: a CI failure after approval changes the recommendation, so the old approval cannot stand.
  const Project = require("../models/Project");
  const Review = require("../models/Review");
  const project = await Project.create({
    name: "Acme", slug: "acme", owner: (await User.findOne({ firebaseUid: "alice-uid" }))._id,
    githubRepository: { owner: "acme", name: "web", fullName: "acme/web" },
    criteria: { items: [{ id: "c1", text: "Do it" }], version: 1, hash: "h1" },
  });
  const sha = "ab".repeat(20);
  const review = await Review.create({
    project: project._id, prNumber: 5, headSha: sha, criteriaHash: "h1", criteriaVersion: 1, verdict: "ready_for_approval",
    requestId: "req", reportHash: "old-hash", results: [{ id: "c1", text: "Do it", status: "supported", explanation: "ok", citations: [{ path: "a.js", startLine: 1, endLine: 1 }] }],
    ci: { state: "success", runs: [] }, approval: { byUid: "alice-uid", byName: "Alice", at: new Date() },
  });
  global.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith("/pulls/5")) return json({ number: 5, head: { sha }, state: "open", merged: false, draft: false, user: { login: "bob", id: 222 },
      base: { ref: "main", repo: { private: false } }, title: "T", body: "", html_url: "u", changed_files: 0 });
    if (href.includes("/pulls/5/files")) return json([]);
    if (href.includes("/check-runs")) return json({ check_runs: [{ name: "ci", status: "completed", conclusion: "failure", html_url: "u" }] });
    if (href.includes("/status")) return json({ statuses: [] });
    return json({}, 404);
  };
  const { reviewPullRequest } = require("../services/review/reviewer");
  const { review: refreshed, reused } = await reviewPullRequest({ project, prNumber: 5, requestedByUid: "x", config: { maxContextChars: 24000, maxPromptChars: 60000 } });
  assert.equal(reused, true);
  assert.equal(refreshed.verdict, "changes_requested");
  assert.notEqual(refreshed.reportHash, "old-hash");
  const stored = await Review.findById(review._id);
  assert.equal(stored.approval?.at, undefined, "approval is cleared when the recommendation changes");
});
