const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, unique: true, index: true },
  email: { type: String, default: "" },
  displayName: { type: String, default: "" },
  photoURL: { type: String, default: "" },
  github: {
    // Numeric GitHub account id from the signed Firebase token. Identity is bound to this, never to a typed name.
    id: { type: String, default: "" },
    username: { type: String, default: "" },
    profileUrl: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    displayName: { type: String, default: "" },
    bio: { type: String, default: "" },
    connectedAt: { type: Date, default: null },
  },
  // Payment account: a passkey-controlled smart account on Whitechain Sepolia (no seed phrase, no gas token).
  wallet: {
    address: { type: String, default: "", lowercase: true, trim: true },
    chainId: { type: Number, default: null },
    kind: { type: String, enum: ["passkey", ""], default: "" },
    connectedAt: { type: Date, default: null },
    passkey: {
      credentialId: { type: String, default: "" },
      qx: { type: String, default: "" },
      qy: { type: String, default: "" },
    },
    deployTx: { type: String, default: "" },
    deployed: { type: Boolean, default: false },
    // Pending registration ceremony (single use, short-lived).
    challengeMessage: { type: String, default: "" },
    challengeExpiresAt: { type: Date, default: null },
  },
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }],
  ownedProjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Project" }],
}, { timestamps: true });

UserSchema.index({ "github.id": 1 }, { unique: true, partialFilterExpression: { "github.id": { $type: "string", $gt: "" } } });
UserSchema.index({ "wallet.address": 1 }, { unique: true, partialFilterExpression: { "wallet.address": { $type: "string", $gt: "" } } });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
