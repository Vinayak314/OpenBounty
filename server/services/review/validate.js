const STATUSES = ["supported", "missing", "needs_verification"];
const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// Pulls the first balanced JSON object out of model text (tolerates ```json fences and preamble).
function extractJson(text) {
  const source = String(text || "");
  const start = source.indexOf("{");
  if (start === -1) return null;
  let depth = 0; let inString = false; let escaped = false;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (inString) {
      if (escaped) escaped = false; else if (ch === "\\") escaped = true; else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(source.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

// Validates model output against the approved criteria and the real PR patches.
// Never trusts the model: unknown criteria are ignored, missing ones become "needs_verification",
// and "supported" without at least one citation that exists in the diff is downgraded.
function validateReport(raw, { criteria, shownDiff }) {
  const patchLines = new Map(shownDiff.map((file) => [
    file.path,
    new Set([...file.text.matchAll(/^L(\d+)[+ ] /gm)].map((match) => Number(match[1]))),
  ]));
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.criteria)) return { ok: false, error: "malformed_output" };

  let droppedCitations = 0;
  const byId = new Map();
  for (const item of raw.criteria) {
    const id = clip(item?.id, 40);
    if (!criteria.some((c) => c.id === id) || byId.has(id)) continue;

    const citations = [];
    for (const cite of Array.isArray(item.citations) ? item.citations.slice(0, 8) : []) {
      const path = clip(cite?.path, 300);
      const start = cite?.startLine;
      const end = cite?.endLine ?? start;
      const lines = patchLines.get(path);
      const valid = lines && Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start
        && end - start <= 200 && Array.from({ length: end - start + 1 }, (_, offset) => lines.has(start + offset)).every(Boolean);
      if (valid) citations.push({ path, startLine: start, endLine: end });
      else droppedCitations += 1;
    }

    let status = STATUSES.includes(item.status) ? item.status : "needs_verification";
    let explanation = clip(item.explanation, 600);
    if (status === "supported" && citations.length === 0) {
      status = "needs_verification";
      explanation = `${explanation} (Downgraded: no citation could be verified against the diff.)`.trim();
    }
    byId.set(id, { id, status, explanation, citations });
  }

  const results = criteria.map((criterion) => ({
    id: criterion.id,
    text: criterion.text,
    ...(byId.get(criterion.id) || {
      status: "needs_verification", explanation: "The reviewer returned no assessment for this criterion.", citations: [],
    }),
  }));

  return {
    ok: true,
    droppedCitations,
    report: {
      summary: clip(raw.summary, 1200),
      criteria: results,
      risks: (Array.isArray(raw.risks) ? raw.risks : []).slice(0, 8).map((r) => clip(r, 300)).filter(Boolean),
      uncertainty: clip(raw.uncertainty, 600),
    },
  };
}

const VERDICTS = {
  ready_for_approval: "Recommend approval",
  changes_requested: "Changes requested",
  needs_maintainer: "Maintainer review needed",
};

// Deterministic recommendation. The model's opinion is advisory input only; this function decides the label,
// and a human maintainer still decides whether to merge and release any reward.
function decideVerdict({ results, ci, pr, diffTruncated, droppedCitations, hasCriteria }) {
  const reasons = [];
  if (!hasCriteria) return { verdict: "needs_maintainer", reasons: ["No approved criteria exist for this project, so there is nothing to review against."] };

  const missing = results.filter((r) => r.status === "missing");
  const unverified = results.filter((r) => r.status === "needs_verification");
  if (missing.length) reasons.push(`${missing.length} criterion/criteria not met: ${missing.map((r) => r.id).join(", ")}.`);
  if (ci.state === "failure") reasons.push("CI is failing on the reviewed commit.");
  if (missing.length || ci.state === "failure") return { verdict: "changes_requested", reasons };

  if (unverified.length) reasons.push(`${unverified.length} criterion/criteria need verification: ${unverified.map((r) => r.id).join(", ")}.`);
  if (ci.state === "pending") reasons.push("CI is still running.");
  if (ci.state === "none") reasons.push("No CI results exist for this commit.");
  if (pr.draft) reasons.push("The pull request is still a draft.");
  if (pr.state === "closed") reasons.push("The pull request is closed without being merged.");
  if (diffTruncated) reasons.push("Part of the diff was too large to review.");
  if (droppedCitations > 0) reasons.push(`${droppedCitations} citation(s) could not be verified against the diff and were removed.`);
  if (reasons.length) return { verdict: "needs_maintainer", reasons };

  return { verdict: "ready_for_approval", reasons: ["Every criterion is supported by verified citations and CI passed."] };
}

module.exports = { extractJson, validateReport, decideVerdict, VERDICTS };
