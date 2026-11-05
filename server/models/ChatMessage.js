const mongoose = require("mongoose");

const ChatMessageSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  authorUid: { type: String, required: true, index: true },
  authorName: { type: String, default: "GitHub user" },
  authorPhoto: { type: String, default: "" },
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
  edited: { type: Boolean, default: false },
}, { timestamps: true });

ChatMessageSchema.index({ project: 1, createdAt: 1 });

module.exports = mongoose.models.ChatMessage || mongoose.model("ChatMessage", ChatMessageSchema);
