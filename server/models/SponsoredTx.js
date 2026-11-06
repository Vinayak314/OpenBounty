const mongoose = require("mongoose");

// Every transaction the gas sponsor paid for: the audit trail behind rate limits and the daily budget.
const SponsoredTxSchema = new mongoose.Schema({
  userUid: { type: String, default: "", index: true }, // "" for backend-initiated attestations
  kind: { type: String, required: true },
  to: { type: String, required: true },
  account: { type: String, default: "" },
  bounty: { type: mongoose.Schema.Types.ObjectId, ref: "Bounty" },
  txHash: { type: String, default: "" },
  status: { type: String, enum: ["sent", "confirmed", "reverted", "failed"], default: "sent" },
  gasUsed: { type: String, default: "0" },
  costWei: { type: String, default: "0" },
  error: { type: String, maxlength: 400 },
}, { timestamps: true });

SponsoredTxSchema.index({ createdAt: -1 });

module.exports = mongoose.models.SponsoredTx || mongoose.model("SponsoredTx", SponsoredTxSchema);
