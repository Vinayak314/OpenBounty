const mongoose = require("mongoose");

// One AI evidence report for a PR head commit against one version of the approved criteria.
const ReviewSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  prNumber: { type: Number, required: true },
  prUrl: { type: String, default: "" },
  prTitle: { type: String, default: "", maxlength: 300 },
  prAuthor: { type: String, default: "" },
  prState: { type: String, default: "open" },
  headSha: { type: String, required: true },
  criteriaHash: { type: String, default: "" },
  criteriaVersion: { type: Number, default: 0 },
  status: { type: String, enum: ["complete", "stale"], default: "complete" },
  verdict: { type: String, enum: ["ready_for_approval", "changes_requested", "needs_maintainer"], required: true },
  verdictReasons: [{ type: String, maxlength: 400 }],
  summary: { type: String, default: "", maxlength: 1200 },
  results: [{
    id: String,
    text: String,
    status: { type: String, enum: ["supported", "missing", "needs_verification"] },
    explanation: String,
    citations: [{ path: String, startLine: Number, endLine: Number }],
  }],
  risks: [{ type: String, maxlength: 300 }],
  uncertainty: { type: String, default: "", maxlength: 600 },
  ci: {
    state: { type: String, default: "none" },
    runs: [{ name: String, conclusion: String, status: String, url: String }],
  },
  diffTruncated: { type: Boolean, default: false },
  droppedCitations: { type: Number, default: 0 },
  requestId: { type: String, default: "" },
  model: { type: String, default: "" },
  reportHash: { type: String, default: "" },
  requestedByUid: { type: String, default: "" },
}, { timestamps: true });

ReviewSchema.index({ project: 1, prNumber: 1, headSha: 1, criteriaHash: 1 });

module.exports = mongoose.models.Review || mongoose.model("Review", ReviewSchema);
