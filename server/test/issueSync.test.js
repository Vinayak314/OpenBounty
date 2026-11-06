const test = require("node:test");
const assert = require("node:assert/strict");
const { commentFor, marker } = require("../services/bounties/issueSync");

const bounty = { number: 3, amount: "2000000", chain: { bountyId: "0xabc" } };

test("issue comments are stage-specific and carry a per-stage marker", () => {
  assert.match(commentFor(bounty, "funded", { amount: "2000000" }), /Bounty #3: funded[\s\S]*2\.0 USDT/);
  assert.match(commentFor(bounty, "paid", { amount: "2000000" }), /Bounty #3: paid/);
  assert.match(commentFor(bounty, "refunded", {}), /no active bounty/);
  assert.equal(commentFor(bounty, "claimed", {}), "");
  assert.notEqual(marker(bounty, "funded"), marker(bounty, "paid"));
});
