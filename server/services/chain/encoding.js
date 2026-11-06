const { keccak256, toUtf8Bytes, zeroPadValue, isHexString, AbiCoder, getAddress, parseUnits, formatUnits } = require("ethers");

// Canonical encodings shared by the backend, the indexer and the contract tests.
// Conventions (not enforced on chain): see contracts/README.md "Backend integration notes".

const USDT_DECIMALS = 6;

/** bytes32 escrow id for a MongoDB bounty id. */
const bountyIdFor = (mongoId) => keccak256(toUtf8Bytes(`openbounty:bounty:${String(mongoId)}`));

/** bytes32 commitment to the exact approved criteria texts (order matters). */
const criteriaHashFor = (texts) => keccak256(toUtf8Bytes(JSON.stringify(texts.map((text) => String(text)))));

/** bytes32 commitment to repository + issue. */
const repoRefFor = (fullName, issueNumber) =>
  keccak256(toUtf8Bytes(`github:${String(fullName).toLowerCase()}#${Number(issueNumber) || 0}`));

/** 40-hex git SHA left-padded to 32 bytes. */
function shaToBytes32(sha) {
  if (!/^[0-9a-f]{40}$/i.test(sha || "")) throw new Error("A 40-character git SHA is required.");
  return zeroPadValue(`0x${sha.toLowerCase()}`, 32);
}

/** bytes32 reference to the claimant's PR at a head commit. */
const submissionRefFor = (fullName, prNumber, headSha) =>
  keccak256(toUtf8Bytes(`github:${String(fullName).toLowerCase()}/pull/${Number(prNumber)}@${String(headSha).toLowerCase()}`));

/** The stored 0G report hash (sha256 hex) as bytes32. */
function reportHashToBytes32(hex) {
  const value = String(hex || "").replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error("The evidence report hash is missing.");
  return `0x${value.toLowerCase()}`;
}

function parseUsdt(amount) {
  const text = String(amount ?? "").trim();
  if (!/^\d{1,9}(\.\d{1,6})?$/.test(text)) throw new Error("Enter an amount in USDT with up to 6 decimals.");
  const value = parseUnits(text, USDT_DECIMALS);
  if (value <= 0n) throw new Error("The reward must be greater than zero.");
  return value;
}

const formatUsdt = (value) => formatUnits(BigInt(value || 0), USDT_DECIMALS);

/** Uniformly random uint256 nonce as a decimal string. */
function randomNonce() {
  return BigInt(`0x${require("node:crypto").randomBytes(32).toString("hex")}`).toString();
}

function checksum(address) {
  return getAddress(address);
}

const isBytes32 = (value) => isHexString(value, 32);
const abi = AbiCoder.defaultAbiCoder();

module.exports = {
  USDT_DECIMALS, bountyIdFor, criteriaHashFor, repoRefFor, shaToBytes32, submissionRefFor, reportHashToBytes32,
  parseUsdt, formatUsdt, randomNonce, checksum, isBytes32, abi,
};
