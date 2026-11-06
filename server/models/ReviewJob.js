const mongoose = require("mongoose");

// Latest review attempt per PR, so queued, running and failed reviews (AI outage, malformed output,
// GitHub errors) stay visible and retryable after the chat scrolls away or the worker restarts.
const ReviewJobSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  prNumber: { type: Number, required: true },
  headSha: { type: String, default: "" },
  source: { type: String, enum: ["chat", "webhook", "ci", "retry"], default: "chat" },
  status: { type: String, enum: ["queued", "running", "complete", "failed", "skipped"], required: true },
  errorCode: { type: String, default: "", maxlength: 40 },
  error: { type: String, default: "", maxlength: 400 },
  review: { type: mongoose.Schema.Types.ObjectId, ref: "Review", default: null },
  requestedByUid: { type: String, default: "" },
  attempts: { type: Number, default: 0 },
}, { timestamps: true });

ReviewJobSchema.index({ project: 1, prNumber: 1 }, { unique: true });

module.exports = mongoose.models.ReviewJob || mongoose.model("ReviewJob", ReviewJobSchema);
