const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true, index: true },
  email: { type: String, default: "" },
  displayName: { type: String, default: "" },
  photoURL: { type: String, default: "" },
  github: {
    username: { type: String, default: "" },
    profileUrl: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    displayName: { type: String, default: "" },
    bio: { type: String, default: "" },
    connectedAt: { type: Date, default: null },
  },
  wallet: {
    address: { type: String, default: "", lowercase: true, trim: true },
    chainId: { type: Number, default: null },
    connectedAt: { type: Date, default: null },
    challengeMessage: { type: String, default: "" },
    challengeExpiresAt: { type: Date, default: null },
  },
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
  ownedProjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Project" }],
}, { timestamps: true });

UserSchema.index({ "wallet.address": 1 }, { unique: true, partialFilterExpression: { "wallet.address": { $type: "string", $gt: "" } } });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
