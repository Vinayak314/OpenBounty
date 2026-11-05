const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const usdt = (n) => ethers.parseUnits(String(n), 6);
const id = (label) => ethers.id(label);
const sha = (hex40) => ethers.zeroPadValue("0x" + hex40, 32);

const REVIEWED_SHA = sha("ab".repeat(20));
const MERGE_REF = id("merge-commit-1");
const REPORT_HASH = id("0g-report-1");

// EIP-712 type definitions. These are written independently of the Solidity source so that a
// divergence between the contract's typehashes and what a backend/wallet would sign is caught.
const TYPES = {
  // Hash of these terms (with the funder) is the EIP-3009 nonce for fundWithAuthorization.
  FundingTerms: [
    { name: "bountyId", type: "bytes32" },
    { name: "funder", type: "address" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "criteriaHash", type: "bytes32" },
    { name: "repoRef", type: "bytes32" },
    { name: "submissionDeadline", type: "uint64" },
  ],
  AcceptClaim: [
    { name: "bountyId", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "claimVersion", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Refund: [
    { name: "bountyId", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  CancelByAgreement: [
    { name: "bountyId", type: "bytes32" },
    { name: "claimVersion", type: "uint32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  PayoutApproval: [
    { name: "bountyId", type: "bytes32" },
    { name: "claimVersion", type: "uint32" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "criteriaHash", type: "bytes32" },
    { name: "reviewedSha", type: "bytes32" },
    { name: "mergeRef", type: "bytes32" },
    { name: "reportHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  SettlementAttestation: [
    { name: "bountyId", type: "bytes32" },
    { name: "claimVersion", type: "uint32" },
    { name: "recipient", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "criteriaHash", type: "bytes32" },
    { name: "reviewedSha", type: "bytes32" },
    { name: "mergeRef", type: "bytes32" },
    { name: "reportHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
  SubmissionAttestation: [
    { name: "bountyId", type: "bytes32" },
    { name: "claimVersion", type: "uint32" },
    { name: "recipient", type: "address" },
    { name: "submissionRef", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "expiry", type: "uint256" },
  ],
};

let nonceCounter = 1n;
const freshNonce = () => nonceCounter++;

async function domainFor(escrow, chainIdOverride) {
  const net = await ethers.provider.getNetwork();
  return {
    name: "OpenBountyEscrow",
    version: "1",
    chainId: chainIdOverride ?? net.chainId,
    verifyingContract: await escrow.getAddress(),
  };
}

/**
 * Build a human Auth struct. `fields` are the typed-data fields other than nonce/deadline.
 * `opts`: { ttl, nonce, deadline, domain, signWith } - signWith lets a test sign with someone
 * other than `signer`. `signer` may be a Signer or a plain address string (then signWith is needed).
 */
async function mkAuth(escrow, signer, typeName, fields, opts = {}) {
  const nonce = opts.nonce ?? freshNonce();
  const deadline = opts.deadline ?? (await time.latest()) + (opts.ttl ?? 3600);
  const domain = opts.domain ?? (await domainFor(escrow));
  const value = { ...fields, nonce, deadline };
  const signature = await (opts.signWith ?? signer).signTypedData(domain, { [typeName]: TYPES[typeName] }, value);
  const address = typeof signer === "string" ? signer : (signer.address ?? signer.target);
  return { signer: address, nonce, deadline, signature };
}

/** Backend attestation. `fields` excludes nonce/expiry. */
async function mkAttestation(escrow, backend, typeName, fields, opts = {}) {
  const nonce = opts.nonce ?? freshNonce();
  const expiry = opts.expiry ?? (await time.latest()) + (opts.ttl ?? 1800);
  const domain = opts.domain ?? (await domainFor(escrow));
  const value = { ...fields, nonce, expiry };
  const signature = await (opts.signWith ?? backend).signTypedData(domain, { [typeName]: TYPES[typeName] }, value);
  return { nonce, expiry, signature };
}

module.exports = {
  usdt,
  id,
  sha,
  REVIEWED_SHA,
  MERGE_REF,
  REPORT_HASH,
  TYPES,
  freshNonce,
  domainFor,
  mkAuth,
  mkAttestation,
};
