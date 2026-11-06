const crypto = require("node:crypto");
const Project = require("../models/Project");
const Review = require("../models/Review");

const MAX_ITEMS = 20;
const MAX_LENGTH = 500;
// Strips a leading bullet ("-", "*", "•") or number ("1.", "2)", "c3:") from a criterion line.
// Whitespace is required after the marker, so "1.5x faster" and "-5% error" keep their numbers.
const BULLET = /^(?:[-*•]|c?\d{1,2}[.):-])\s+/i;

function parseCriteria(raw) {
  return String(raw || "").split("\n").map((line) => line.trim().replace(BULLET, "").trim()).filter(Boolean);
}

function normalizeTexts(texts) {
  return (Array.isArray(texts) ? texts : []).map((text) => String(text ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
}

function criteriaError(texts) {
  if (!texts.length) return "Add at least one criterion.";
  if (texts.length > MAX_ITEMS || texts.some((text) => text.length > MAX_LENGTH)) {
    return `Use at most ${MAX_ITEMS} criteria of up to ${MAX_LENGTH} characters each.`;
  }
  return "";
}

const hashCriteria = (texts) => crypto.createHash("sha256").update(JSON.stringify(texts)).digest("hex").slice(0, 16);

class CriteriaError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// Saves a new approved criteria version. `expectedVersion` (optional) rejects edits made against an older version.
async function approveCriteria({ project, texts, byUid, byName, expectedVersion }) {
  const clean = normalizeTexts(texts);
  const error = criteriaError(clean);
  if (error) throw new CriteriaError(error, "invalid_criteria");

  const items = clean.map((text, index) => ({ id: `c${index + 1}`, text }));
  const filter = { _id: project._id };
  if (Number.isInteger(expectedVersion)) {
    filter.$or = expectedVersion === 0
      ? [{ "criteria.version": 0 }, { "criteria.version": { $exists: false } }]
      : [{ "criteria.version": expectedVersion }];
  }
  const updated = await Project.findOneAndUpdate(filter, {
    $inc: { "criteria.version": 1 },
    $set: {
      "criteria.items": items,
      "criteria.hash": hashCriteria(clean),
      "criteria.approvedByUid": byUid,
      "criteria.approvedByName": String(byName || "").slice(0, 120),
      "criteria.approvedAt": new Date(),
    },
  }, { returnDocument: "after" });
  if (!updated) {
    const exists = await Project.exists({ _id: project._id });
    throw exists
      ? new CriteriaError("Someone approved newer criteria. Reload and review them before saving.", "version_conflict")
      : new CriteriaError("This project no longer exists.", "project_not_found");
  }
  // Evidence produced against older criteria no longer applies.
  await Review.updateMany({ project: project._id, bounty: null, criteriaVersion: { $lt: updated.criteria.version }, status: "complete" },
    { $set: { status: "stale" } });
  project.criteria = updated.criteria;
  return updated.criteria;
}

function criteriaView(criteria) {
  return {
    items: (criteria?.items || []).map((item) => ({ id: item.id, text: item.text })),
    version: criteria?.version || 0,
    hash: criteria?.hash || "",
    approvedByName: criteria?.approvedByName || "",
    approvedAt: criteria?.approvedAt || null,
  };
}

module.exports = { parseCriteria, normalizeTexts, criteriaError, hashCriteria, approveCriteria, criteriaView, CriteriaError, MAX_ITEMS, MAX_LENGTH };
