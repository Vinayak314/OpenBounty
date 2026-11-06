const { TypedDataEncoder, Interface } = require("ethers");
const { ESCROW_ABI } = require("./abi");
const { randomNonce } = require("./encoding");

// EIP-712 types mirrored from BountyEscrow.sol and OpenBountyAccount.sol.
const ESCROW_TYPES = {
  AcceptClaim: [
    { name: "bountyId", type: "bytes32" }, { name: "recipient", type: "address" },
    { name: "claimVersion", type: "uint32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
  ],
  Refund: [{ name: "bountyId", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
  CancelByAgreement: [
    { name: "bountyId", type: "bytes32" }, { name: "claimVersion", type: "uint32" },
    { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
  ],
  SettlementAttestation: [
    { name: "bountyId", type: "bytes32" }, { name: "claimVersion", type: "uint32" }, { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" }, { name: "criteriaHash", type: "bytes32" }, { name: "reviewedSha", type: "bytes32" },
    { name: "mergeRef", type: "bytes32" }, { name: "reportHash", type: "bytes32" }, { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
  SubmissionAttestation: [
    { name: "bountyId", type: "bytes32" }, { name: "claimVersion", type: "uint32" }, { name: "recipient", type: "address" },
    { name: "submissionRef", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint256" },
  ],
  PayoutApproval: [
    { name: "bountyId", type: "bytes32" }, { name: "claimVersion", type: "uint32" }, { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" }, { name: "criteriaHash", type: "bytes32" }, { name: "reviewedSha", type: "bytes32" },
    { name: "mergeRef", type: "bytes32" }, { name: "reportHash", type: "bytes32" }, { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const ACCOUNT_TYPES = {
  Execute: [{ name: "calls", type: "Call[]" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
  Call: [{ name: "target", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }],
};

const escrowDomain = (chainId, escrow) => ({ name: "OpenBountyEscrow", version: "1", chainId, verifyingContract: escrow });
const accountDomain = (chainId, account) => ({ name: "OpenBountyAccount", version: "1", chainId, verifyingContract: account });

const pick = (type, value) => Object.fromEntries(ESCROW_TYPES[type].map(({ name }) => [name, value[name]]));

/** Digest a passkey account signs for an `execute` batch. */
function executeDigest({ chainId, account, calls, nonce, deadline }) {
  return TypedDataEncoder.hash(accountDomain(chainId, account), ACCOUNT_TYPES, {
    calls: calls.map((call) => ({ target: call.target, value: BigInt(call.value || 0), data: call.data })),
    nonce: BigInt(nonce), deadline: BigInt(deadline),
  });
}

/** Digest of an escrow authorization (used for ERC-1271 consent signatures, e.g. CancelByAgreement). */
function escrowDigest({ chainId, escrow, type, value }) {
  return TypedDataEncoder.hash(escrowDomain(chainId, escrow), { [type]: ESCROW_TYPES[type] }, pick(type, value));
}

/**
 * Backend attestation (SubmissionAttestation | SettlementAttestation), signed by the dedicated attestation key.
 * Short-lived: the escrow rejects expiries more than 1 hour ahead.
 */
async function signAttestation({ signer, chainId, escrow, type, value, ttlSeconds = 15 * 60, now = Math.floor(Date.now() / 1000) }) {
  if (!["SubmissionAttestation", "SettlementAttestation"].includes(type)) throw new Error("Unknown attestation type.");
  const nonce = randomNonce();
  const expiry = now + Math.min(Math.max(ttlSeconds, 60), 55 * 60);
  const message = pick(type, { ...value, nonce, expiry });
  const signature = await signer.signTypedData(escrowDomain(chainId, escrow), { [type]: ESCROW_TYPES[type] }, message);
  return { nonce, expiry, signature };
}

/**
 * PayoutApproval signed by the automatic-payout key (an EOA, so ECDSA). Returns the escrow's `Auth` struct.
 * The escrow only accepts it from a registered agent, within that agent's cap, alongside a settlement attestation.
 */
async function signPayoutApproval({ signer, chainId, escrow, value, ttlSeconds = 15 * 60, now = Math.floor(Date.now() / 1000) }) {
  const nonce = randomNonce();
  const deadline = now + Math.min(Math.max(ttlSeconds, 60), 60 * 60);
  const message = pick("PayoutApproval", { ...value, nonce, deadline });
  const signature = await signer.signTypedData(escrowDomain(chainId, escrow), { PayoutApproval: ESCROW_TYPES.PayoutApproval }, message);
  return { signer: signer.address, nonce, deadline, signature };
}

const escrowInterface = new Interface(ESCROW_ABI);

module.exports = { ESCROW_TYPES, ACCOUNT_TYPES, escrowDomain, accountDomain, executeDigest, escrowDigest, signAttestation, signPayoutApproval, escrowInterface };
