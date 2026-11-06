const mongoose = require("mongoose");

// Escrow logs applied by the indexer. The unique (txHash, logIndex) key makes replays and re-scans idempotent.
const ChainEventSchema = new mongoose.Schema({
  txHash: { type: String, required: true },
  logIndex: { type: Number, required: true },
  blockNumber: { type: Number, required: true },
  name: { type: String, required: true },
  bountyId: { type: String, default: "", index: true },
  args: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

ChainEventSchema.index({ txHash: 1, logIndex: 1 }, { unique: true });

const ChainCursorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  block: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = {
  ChainEvent: mongoose.models.ChainEvent || mongoose.model("ChainEvent", ChainEventSchema),
  ChainCursor: mongoose.models.ChainCursor || mongoose.model("ChainCursor", ChainCursorSchema),
};
