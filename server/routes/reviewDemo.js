const express = require("express");
const { getAiConfig } = require("../config/ai");
const { evaluateReview } = require("../services/review/reviewer");
const { reportView } = require("../services/chatSerializer");

const router = express.Router();
const criteria = [
  { id: "c1", text: "Ignore duplicate submissions while a save is in progress." },
  { id: "c2", text: "Reset the pending flag even when the save fails, so the user can retry." },
];
const revisions = [
  {
    id: "first",
    title: "First revision",
    patch: [
      "@@ -1,4 +1,6 @@", " let pending = false;", " async function submit() {",
      "+  if (pending) return;", "+  pending = true;", "   await save();", " }",
    ].join("\n"),
  },
  {
    id: "fixed",
    title: "After the fix",
    patch: [
      "@@ -1,4 +1,10 @@", " let pending = false;", " async function submit() {",
      "+  if (pending) return;", "+  pending = true;", "+  try {", "   await save();",
      "+  } finally {", "+    pending = false;", "+  }", " }",
    ].join("\n"),
  },
];

const windowMs = 60 * 60 * 1000;
let started = [];
let active = 0;

router.get("/", (_req, res) => {
  const config = getAiConfig();
  res.json({
    enabled: process.env.ZEROG_DEMO_ENABLED === "true" && config.enabled && Boolean(config.apiKey),
    criteria, revisions,
  });
});

router.post("/", async (req, res) => {
  const config = getAiConfig();
  if (process.env.ZEROG_DEMO_ENABLED !== "true" || !config.enabled || !config.apiKey) {
    return res.status(503).json({ error: "Live reviews are unavailable in this demo right now." });
  }
  const revision = revisions.find((item) => item.id === req.body?.revision);
  if (!revision) return res.status(400).json({ error: "Choose one of the sample revisions." });
  const configuredLimit = Number(process.env.ZEROG_DEMO_REQUESTS_PER_HOUR);
  const limit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : 24;
  const now = Date.now();
  started = started.filter((at) => now - at < windowMs);
  if (active >= 2 || started.length >= limit) {
    return res.status(429).json({ error: "The demo is busy or has reached its hourly limit. Try again later." });
  }

  started.push(now);
  active++;
  try {
    const evidence = await evaluateReview({
      criteria,
      config: { ...config, maxRetries: 0, timeoutMs: Math.min(config.timeoutMs, 45000) },
      pr: {
        number: 1, title: revision.title, author: "sample contributor", baseBranch: "main", state: "open",
        body: "Prevent a second submission while save is pending, and keep retries working after a failure.",
        ci: { state: "none", runs: [] }, filesTruncated: false,
        files: [{ path: "src/submit.js", patch: revision.patch, additions: 6, deletions: 0 }],
      },
    });
    const report = reportView({ ...evidence, prNumber: 1, prTitle: revision.title, headSha: "", status: "complete" });
    res.json({ report: { ...report, subtitle: revision.title + " · sample pull request" } });
  } catch (error) {
    console.error("0G demo review failed:", error.code || error.name);
    res.status(502).json({ error: "The live 0G review could not finish. Try again." });
  } finally {
    active--;
  }
});

module.exports = router;
