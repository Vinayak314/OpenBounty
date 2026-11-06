const mongoose = require("mongoose");

// A server-built action waiting for the user's passkey. The server, not the browser, decides the calls;
// the browser only returns a passkey assertion over `digest`.
const WalletIntentSchema = new mongoose.Schema({
  userUid: { type: String, required: true, index: true },
  account: { type: String, required: true },
  kind: { type: String, required: true }, // fund | accept_claim | settle | refund | cancel | cancel_consent | roles | accept_ownership
  mode: { type: String, enum: ["execute", "sign"], default: "execute" }, // sign: ERC-1271 consent, no transaction
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
  bounty: { type: mongoose.Schema.Types.ObjectId, ref: "Bounty" },
  calls: [{ target: String, value: { type: String, default: "0" }, data: String }],
  nonce: { type: String, default: "0" },
  deadline: { type: Number, required: true },
  digest: { type: String, required: true },
  summary: { type: String, default: "", maxlength: 500 },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ["pending", "submitted", "confirmed", "failed", "expired"], default: "pending" },
  txHash: String,
  error: { type: String, maxlength: 400 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

WalletIntentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

module.exports = mongoose.models.WalletIntent || mongoose.model("WalletIntent", WalletIntentSchema);
