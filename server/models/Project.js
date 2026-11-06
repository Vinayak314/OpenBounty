const mongoose = require("mongoose");

const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, default: "", maxlength: 2000 },
  githubRepository: {
    owner: { type: String, default: "" },
    name: { type: String, default: "" },
    fullName: { type: String, default: "" },
    url: { type: String, default: "" },
  },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  coOwners: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  group: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
  status: { type: String, enum: ["active", "paused", "archived"], default: "active" },
  // Approved acceptance criteria the reviewer checks PRs against. Replaced as a whole; version/hash change each time.
  criteria: {
    items: [{ id: { type: String, required: true }, text: { type: String, required: true, maxlength: 500 } }],
    version: { type: Number, default: 0 },
    hash: { type: String, default: "" },
    approvedByUid: { type: String, default: "" },
    approvedByName: { type: String, default: "" },
    approvedAt: { type: Date, default: null },
  },
}, { timestamps: true });

ProjectSchema.index({ owner: 1, status: 1 });
ProjectSchema.index({ "githubRepository.fullName": 1 }, { sparse: true });

module.exports = mongoose.models.Project || mongoose.model("Project", ProjectSchema);
