// Human-readable ABIs for the contracts the backend reads, relays to and indexes.
const AUTH = "tuple(address signer, uint256 nonce, uint256 deadline, bytes signature)";
const ATTESTATION = "tuple(uint256 nonce, uint256 expiry, bytes signature)";
const TERMS = "tuple(bytes32 bountyId, address token, uint256 amount, bytes32 criteriaHash, bytes32 repoRef, uint64 submissionDeadline)";
const SETTLEMENT = "tuple(bytes32 bountyId, uint32 claimVersion, address recipient, uint256 amount, bytes32 criteriaHash, bytes32 reviewedSha, bytes32 mergeRef, bytes32 reportHash)";
const CALL = "tuple(address target, uint256 value, bytes data)";

const ESCROW_ABI = [
  `function fund(${TERMS} terms)`,
  `function acceptClaim(bytes32 bountyId, address recipient, ${AUTH} auth)`,
  "function expireClaim(bytes32 bountyId)",
  `function registerSubmission(bytes32 bountyId, uint32 claimVersion, bytes32 submissionRef, ${ATTESTATION} att)`,
  `function settle(${SETTLEMENT} s, ${ATTESTATION} att, ${AUTH} approval)`,
  `function refund(bytes32 bountyId, ${AUTH} auth)`,
  `function cancelByAgreement(bytes32 bountyId, uint32 claimVersion, ${AUTH} funderSide, ${AUTH} claimant)`,
  "function setMaintainer(address account, bool enabled)",
  "function setSettlementWallet(address account, bool enabled)",
  "function setAutoPayoutAgent(address account, uint256 maxAmount)",
  "function acceptOwnership()",
  "function invalidateNonce(uint256 nonce)",
  "function autoPayoutCap(address account) view returns (uint256)",
  "function canAutoPay(address account, uint256 amount) view returns (bool)",
  "function owner() view returns (address)",
  "function pendingOwner() view returns (address)",
  "function attestationSigner() view returns (address)",
  "function isTokenAllowed(address token) view returns (bool)",
  "function isMaintainer(address account) view returns (bool)",
  "function isSettlementWallet(address account) view returns (bool)",
  "function hasMaintainerRole(address account) view returns (bool)",
  "function canAuthorizePayout(address account) view returns (bool)",
  "function effectiveStatus(bytes32 bountyId) view returns (uint8)",
  "function getBounty(bytes32 bountyId) view returns (tuple(address funder, uint8 status, uint32 claimVersion, uint64 submissionDeadline, address token, uint256 amount, bytes32 criteriaHash, bytes32 repoRef, bytes32 termsHash, address recipient, uint64 claimExpiry, bytes32 submissionRef))",
  "event MaintainerUpdated(address indexed account, bool enabled)",
  "event SettlementWalletUpdated(address indexed account, bool enabled)",
  "event AutoPayoutAgentUpdated(address indexed account, uint256 maxAmount)",
  "event AttestationSignerUpdated(address indexed previousSigner, address indexed newSigner)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "event BountyFunded(bytes32 indexed bountyId, address indexed funder, address indexed token, uint256 amount, bytes32 criteriaHash, bytes32 repoRef, uint64 submissionDeadline, bytes32 termsHash)",
  "event ClaimAccepted(bytes32 indexed bountyId, uint32 claimVersion, address indexed recipient, address indexed acceptedBy, uint64 claimExpiry)",
  "event ClaimExpired(bytes32 indexed bountyId, uint32 claimVersion, address indexed recipient)",
  "event SubmissionRegistered(bytes32 indexed bountyId, uint32 claimVersion, address indexed recipient, bytes32 submissionRef, uint256 attestationNonce)",
  "event PayoutSettled(bytes32 indexed bountyId, uint32 claimVersion, address indexed recipient, address indexed token, uint256 amount, bytes32 criteriaHash, bytes32 reviewedSha, bytes32 mergeRef, bytes32 reportHash, address approvedBy, address attestedBy, uint256 attestationNonce)",
  "event BountyRefunded(bytes32 indexed bountyId, address indexed funder, address indexed token, uint256 amount, uint8 reason, address authorizedBy)",
  "error ZeroAddress()", "error NotMaintainer(address account)", "error NotPayoutAuthority(address account)",
  "error TokenNotAllowed(address token)", "error InvalidTerms()", "error BountyExists(bytes32 bountyId)",
  "error BadStatus(uint8 current)", "error DeadlinePassed()", "error ClaimNotExpired()", "error ClaimHasExpired()",
  "error ClaimVersionMismatch(uint32 expected, uint32 given)", "error InvalidRecipient()", "error AuthExpired()",
  "error AuthTtlTooLong()", "error AttestationExpired()", "error AttestationTtlTooLong()", "error NonceAlreadyUsed()",
  "error InvalidSignature()", "error SettlementMismatch()", "error SelfPayment()", "error NotRefundAuthority(address account)",
  "error PartiesNotDistinct()", "error UnexpectedTransferAmount(uint256 expected, uint256 received)", "error Unsupported()",
  "error OwnableUnauthorizedAccount(address account)",
  "error AutoPayoutCapExceeded(uint256 amount, uint256 cap)", "error InvalidAutoPayoutAgent(address account)",
];

const ACCOUNT_ABI = [
  `function execute(${CALL}[] calls, uint256 deadline, bytes signature) returns (bytes[] results)`,
  `function executeDigest(${CALL}[] calls, uint256 nonce, uint256 deadline) view returns (bytes32)`,
  "function nonce() view returns (uint256)",
  "function qx() view returns (bytes32)",
  "function qy() view returns (bytes32)",
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
  "event Executed(uint256 indexed nonce, uint256 calls, address indexed relayer)",
  "error ExecutionExpired()", "error ExecutionTtlTooLong()", "error InvalidSignature()", "error EmptyBatch()",
  "error CallFailed(uint256 index, bytes reason)",
];

const FACTORY_ABI = [
  "function createAccount(bytes32 qx, bytes32 qy) returns (address)",
  "function accountAddress(bytes32 qx, bytes32 qy) view returns (address)",
  "event AccountCreated(address indexed account, bytes32 qx, bytes32 qy)",
  "error InvalidPublicKey()",
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
];

const BOUNTY_STATUS = ["draft", "funded", "claimed", "submitted", "paid", "refunded"];
const REFUND_REASONS = ["no_active_claim", "deadline_passed", "mutual_cancellation"];

module.exports = { ESCROW_ABI, ACCOUNT_ABI, FACTORY_ABI, ERC20_ABI, BOUNTY_STATUS, REFUND_REASONS };
