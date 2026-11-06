const mongoose = require("mongoose");

// One GitHub bounty. MongoDB holds the full terms and workflow; the escrow holds the money and commitments.
// Chain-derived fields (`chain.*`, funded/claimed/submitted/paid/refunded statuses) are written only by the
// indexer from verified receipts and contract reads, never from client input.
const party = {
  uid: { type: String, default: "" },
  githubId: { type: String, default: "" },
  name: { type: String, default: "", maxlength: 120 },
  githubLogin: { type: String, default: "", maxlength: 39 },
  account: { type: String, default: "" },
};

const BountySchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  number: { type: Number, required: true },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: "", maxlength: 4000 },
  issue: { number: Number, title: { type: String, maxlength: 300 }, url: String },
  criteria: {
    items: [{ id: String, text: { type: String, maxlength: 500 } }],
    hash: { type: String, default: "" }, // bytes32 keccak256 of the texts, committed on chain at funding
  },
  amount: { type: String, required: true }, // token base units (USDT has 6 decimals)
  token: { type: String, required: true },
  submissionDeadline: { type: Date, required: true },
  createdBy: party,
  // draft -> funding (terms locked, signature pending) -> funded -> claimed -> submitted -> paid | refunded
  status: { type: String, enum: ["draft", "funding", "funded", "claimed", "submitted", "paid", "refunded"], default: "draft", index: true },
  claimRequests: [{
    ...party,
    message: { type: String, default: "", maxlength: 1000 },
    status: { type: String, enum: ["pending", "accepted", "declined", "withdrawn"], default: "pending" },
    at: { type: Date, default: Date.now },
  }],
  claimant: party,
  submission: {
    prNumber: Number, prUrl: String, headSha: String, ref: String,
    requestedAt: Date, txHash: String, error: { type: String, maxlength: 300 },
  },
  payout: { reviewId: { type: mongoose.Schema.Types.ObjectId, ref: "Review" }, reviewedSha: String, mergeSha: String, reportHash: String, approvedByUid: String },
  cancelConsent: { signer: String, nonce: String, deadline: Number, signature: String, claimVersion: Number, at: Date },
  chain: {
    bountyId: { type: String, required: true },
    repoRef: String,
    termsHash: String,
    funder: String,
    claimVersion: { type: Number, default: 0 },
    recipient: String,
    claimExpiry: Date,
    submissionRef: String,
    fundTx: String,
    acceptTx: String,
    submissionTx: String,
    payoutTx: String,
    refundTx: String,
    termsMismatch: { type: Boolean, default: false },
    refundReason: String,
    payoutApprovedBy: String,
    payoutAttestedBy: String,
    lastBlock: { type: Number, default: 0 },
    lastLogIndex: { type: Number, default: -1 },
    syncedAt: Date,
  },
}, { timestamps: true });

BountySchema.index({ project: 1, number: 1 }, { unique: true });
BountySchema.index({ "chain.bountyId": 1 }, { unique: true });
// One pull request can back at most one bounty (set only while a submission is registered or pending).
BountySchema.index({ project: 1, "submission.prNumber": 1 }, { unique: true, partialFilterExpression: { "submission.prNumber": { $type: "number" } } });

module.exports = mongoose.models.Bounty || mongoose.model("Bounty", BountySchema);
