const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  authorUid: { type: String, required: true, index: true },
  authorName: { type: String, default: "GitHub user" },
  authorPhoto: { type: String, default: "" },
  clientMessageId: { type: String, maxlength: 32 },
  body: { type: String, default: "", trim: true, maxlength: 10000 },
  attachments: [{
    name: { type: String, required: true, maxlength: 255 },
    preview: { type: String, default: "", maxlength: 600000 },
  }],
  replyTo: {
    id: { type: String, default: "" },
    author: { type: String, default: "" },
    snippet: { type: String, default: "", maxlength: 120 },
  },
  reactions: [{
    emoji: { type: String, required: true, maxlength: 8 },
    users: [{ type: String, required: true }],
  }],
  edited: { type: Boolean, default: false },
  // Set on agent messages that carry a structured PR evidence report.
  review: { type: mongoose.Schema.Types.ObjectId, ref: "Review", default: undefined },
  // Set only on messages produced by the central AI agent (or its deterministic failure notices).
  agent: {
    role: { type: String, enum: ["guide", "scope", "reviewer"] },
    status: { type: String, enum: ["ok", "error"] },
    requestId: { type: String, default: "", maxlength: 200 },
    model: { type: String, default: "", maxlength: 200 },
    contextHash: { type: String, default: "", maxlength: 80 },
    repoSha: { type: String, default: "", maxlength: 40 },
    repoFiles: [{ type: String, maxlength: 300 }],
    triggerMessage: { type: String, default: "", maxlength: 40 },
    errorCode: { type: String, default: "", maxlength: 40 },
    provider: { type: String, default: "", maxlength: 200 },
    e2ee: { type: String, default: "", maxlength: 40 },
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
  },
}, { timestamps: true });

ChatMessageSchema.index({ project: 1, createdAt: 1 });
ChatMessageSchema.index({ project: 1, authorUid: 1, _id: -1 });

module.exports = mongoose.models.ChatMessage || mongoose.model("ChatMessage", ChatMessageSchema);
