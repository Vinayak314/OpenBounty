// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC3009} from "./interfaces/IERC3009.sol";

/// @title OpenBounty escrow
/// @notice Holds an allowlisted ERC-20 reward for one GitHub bounty at a time and releases it
///         exactly once to the claimant bound at claim acceptance, or returns it to the original
///         funder under the narrow refund rules below. Intended for Whitechain Sepolia (1874) and
///         the designated test USDT, but the token is an allowlist parameter.
///
/// @dev    TRUST BOUNDARY. The contract cannot read GitHub. Two things are trusted offchain:
///         (1) `attestationSigner` (the OpenBounty backend key, separate from the AI service)
///         asserts GitHub facts: that a claimant's PR was submitted, and that it was merged and
///         reviewed at a given SHA. (2) A human maintainer's signature authorizes payouts.
///         Payout needs BOTH. The backend can neither pay alone nor redirect funds: the recipient
///         and amount are fixed onchain at funding/acceptance.
///
///         Lifecycle: Draft (no onchain record) -> Funded -> Claimed -> Submitted -> Paid, plus
///         Refunded. Terms (token, amount, criteria hash, deadline) are written once at funding
///         and are immutable. There is no function that withdraws arbitrary balances.
///
///         RELAYING. Every privileged action takes an `Auth{signer, nonce, deadline, signature}`.
///         Authority is the verified `signer` (ECDSA or ERC-1271 smart account over an EIP-712
///         digest bound to this chain and contract). `msg.sender` is never treated as an authority
///         unless it equals `signer`, so a relayer or gas sponsor has no powers of its own.
contract BountyEscrow is EIP712, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                                 TYPES
    //////////////////////////////////////////////////////////////*/

    /// @dev `Draft` is the zero value: a bounty id with no onchain record. Funding creates the
    ///      record atomically in `Funded`, so terms can never be edited after the money is locked.
    enum Status {
        Draft,
        Funded,
        Claimed,
        Submitted,
        Paid,
        Refunded
    }

    enum RefundReason {
        NoActiveClaim, // before any claim, or after a claim expired/was released, deadline not passed
        DeadlinePassed, // submission deadline passed with no protected submission
        MutualCancellation
    }

    /// @notice Agreement terms, locked at funding.
    struct Terms {
        bytes32 bountyId; // backend-chosen unique id
        address token; // must be allowlisted
        uint256 amount;
        bytes32 criteriaHash; // hash of the maintainer-approved criteria
        bytes32 repoRef; // commitment to repo + issue ids (opaque to the contract)
        uint64 submissionDeadline; // unix seconds
    }

    struct Bounty {
        address funder;
        Status status;
        uint32 claimVersion; // increments on every accepted claim
        uint64 submissionDeadline;
        address token;
        uint256 amount;
        bytes32 criteriaHash;
        bytes32 repoRef;
        bytes32 termsHash;
        address recipient; // bound claimant wallet; cleared when a claim expires
        uint64 claimExpiry;
        bytes32 submissionRef; // set by registerSubmission
    }

    /// @notice Signed authorization from a human (EOA or ERC-1271 account).
    struct Auth {
        address signer;
        uint256 nonce;
        uint256 deadline;
        bytes signature; // ignored when signer == msg.sender
    }

    /// @notice Signed assertion by the backend attestation signer.
    struct Attestation {
        uint256 nonce;
        uint256 expiry;
        bytes signature;
    }

    /// @notice The facts a payout binds. Both the maintainer approval and the backend
    ///         attestation sign exactly these fields (plus their own nonce/expiry).
    struct Settlement {
        bytes32 bountyId;
        uint32 claimVersion;
        address recipient;
        uint256 amount;
        bytes32 criteriaHash;
        bytes32 reviewedSha; // git commit SHA, left-padded to 32 bytes
        bytes32 mergeRef; // merge commit / merge event reference
        bytes32 reportHash; // hash of the AI evidence report the maintainer reviewed
    }

    /*//////////////////////////////////////////////////////////////
                               CONSTANTS
    //////////////////////////////////////////////////////////////*/

    uint64 public constant CLAIM_WINDOW = 72 hours;
    /// @dev Backend attestations must expire within this window ("short-lived", enforced onchain).
    uint256 public constant MAX_ATTESTATION_TTL = 1 hours;
    /// @dev Human signatures must expire within this window.
    uint256 public constant MAX_AUTH_TTL = 24 hours;

    bytes32 public constant TERMS_TYPEHASH = keccak256(
        "FundingTerms(bytes32 bountyId,address funder,address token,uint256 amount,bytes32 criteriaHash,bytes32 repoRef,uint64 submissionDeadline)"
    );
    bytes32 public constant ACCEPT_CLAIM_TYPEHASH =
        keccak256("AcceptClaim(bytes32 bountyId,address recipient,uint32 claimVersion,uint256 nonce,uint256 deadline)");
    bytes32 public constant REFUND_TYPEHASH = keccak256("Refund(bytes32 bountyId,uint256 nonce,uint256 deadline)");
    bytes32 public constant CANCEL_TYPEHASH =
        keccak256("CancelByAgreement(bytes32 bountyId,uint32 claimVersion,uint256 nonce,uint256 deadline)");
    bytes32 public constant PAYOUT_APPROVAL_TYPEHASH = keccak256(
        "PayoutApproval(bytes32 bountyId,uint32 claimVersion,address recipient,uint256 amount,bytes32 criteriaHash,bytes32 reviewedSha,bytes32 mergeRef,bytes32 reportHash,uint256 nonce,uint256 deadline)"
    );
    bytes32 public constant SETTLEMENT_ATTESTATION_TYPEHASH = keccak256(
        "SettlementAttestation(bytes32 bountyId,uint32 claimVersion,address recipient,uint256 amount,bytes32 criteriaHash,bytes32 reviewedSha,bytes32 mergeRef,bytes32 reportHash,uint256 nonce,uint256 expiry)"
    );
    bytes32 public constant SUBMISSION_ATTESTATION_TYPEHASH = keccak256(
        "SubmissionAttestation(bytes32 bountyId,uint32 claimVersion,address recipient,bytes32 submissionRef,uint256 nonce,uint256 expiry)"
    );

    /*//////////////////////////////////////////////////////////////
                                STORAGE
    //////////////////////////////////////////////////////////////*/

    address public attestationSigner;
    mapping(address token => bool) public isTokenAllowed;
    mapping(address account => bool) public isMaintainer;
    mapping(address account => bool) public isSettlementWallet;

    mapping(bytes32 bountyId => Bounty) private _bounties;
    mapping(address signer => mapping(uint256 nonce => bool)) public usedAuthNonce;
    mapping(address signer => mapping(uint256 nonce => bool)) public usedAttestationNonce;

    /*//////////////////////////////////////////////////////////////
                                 EVENTS
    //////////////////////////////////////////////////////////////*/

    event MaintainerUpdated(address indexed account, bool enabled);
    event SettlementWalletUpdated(address indexed account, bool enabled);
    event AttestationSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event TokenAllowlistUpdated(address indexed token, bool allowed);
    event NonceInvalidated(address indexed signer, uint256 nonce);

    event BountyFunded(
        bytes32 indexed bountyId,
        address indexed funder,
        address indexed token,
        uint256 amount,
        bytes32 criteriaHash,
        bytes32 repoRef,
        uint64 submissionDeadline,
        bytes32 termsHash
    );
    event ClaimAccepted(
        bytes32 indexed bountyId,
        uint32 claimVersion,
        address indexed recipient,
        address indexed acceptedBy,
        uint64 claimExpiry
    );
    event ClaimExpired(bytes32 indexed bountyId, uint32 claimVersion, address indexed recipient);
    event SubmissionRegistered(
        bytes32 indexed bountyId,
        uint32 claimVersion,
        address indexed recipient,
        bytes32 submissionRef,
        uint256 attestationNonce
    );
    event PayoutSettled(
        bytes32 indexed bountyId,
        uint32 claimVersion,
        address indexed recipient,
        address indexed token,
        uint256 amount,
        bytes32 criteriaHash,
        bytes32 reviewedSha,
        bytes32 mergeRef,
        bytes32 reportHash,
        address approvedBy,
        address attestedBy,
        uint256 attestationNonce
    );
    event BountyRefunded(
        bytes32 indexed bountyId,
        address indexed funder,
        address indexed token,
        uint256 amount,
        RefundReason reason,
        address authorizedBy
    );

    /*//////////////////////////////////////////////////////////////
                                 ERRORS
    //////////////////////////////////////////////////////////////*/

    error ZeroAddress();
    error NotMaintainer(address account);
    error NotPayoutAuthority(address account);
    error TokenNotAllowed(address token);
    error InvalidTerms();
    error BountyExists(bytes32 bountyId);
    error BadStatus(Status current);
    error DeadlinePassed();
    error ClaimNotExpired();
    error ClaimHasExpired();
    error ClaimVersionMismatch(uint32 expected, uint32 given);
    error InvalidRecipient();
    error AuthExpired();
    error AuthTtlTooLong();
    error AttestationExpired();
    error AttestationTtlTooLong();
    error NonceAlreadyUsed();
    error InvalidSignature();
    error SettlementMismatch();
    error SelfPayment();
    error NotRefundAuthority(address account);
    error PartiesNotDistinct();
    error UnexpectedTransferAmount(uint256 expected, uint256 received);
    error Unsupported();

    /*//////////////////////////////////////////////////////////////
                              CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    /// @param initialOwner Repository/workspace owner wallet. NOT a platform administrator:
    ///        the owner manages roles and the signer/token allowlists but cannot move funds.
    /// @param attestationSigner_ Backend settlement-attestation key (separate from any AI service).
    /// @param initialTokens Tokens allowed for new bounties (the designated USDT on Whitechain Sepolia).
    constructor(address initialOwner, address attestationSigner_, address[] memory initialTokens)
        EIP712("OpenBountyEscrow", "1")
        Ownable(initialOwner)
    {
        if (attestationSigner_ == address(0)) revert ZeroAddress();
        attestationSigner = attestationSigner_;
        emit AttestationSignerUpdated(address(0), attestationSigner_);
        for (uint256 i = 0; i < initialTokens.length; i++) {
            _setToken(initialTokens[i], true);
        }
    }

    /*//////////////////////////////////////////////////////////////
                           OWNER ADMINISTRATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Grant/revoke the maintainer role (fund, accept claims, refund, cancel).
    function setMaintainer(address account, bool enabled) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        isMaintainer[account] = enabled;
        emit MaintainerUpdated(account, enabled);
    }

    /// @notice Grant/revoke the settlement-wallet flag. Payout authority needs this AND the
    ///         maintainer role (the owner implicitly holds both).
    function setSettlementWallet(address account, bool enabled) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        isSettlementWallet[account] = enabled;
        emit SettlementWalletUpdated(account, enabled);
    }

    /// @notice Rotate the backend attestation key. Does not touch any funded term.
    function setAttestationSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        emit AttestationSignerUpdated(attestationSigner, newSigner);
        attestationSigner = newSigner;
    }

    /// @notice Allow/deny a token for NEW bounties. Existing bounties keep the token they locked.
    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        _setToken(token, allowed);
    }

    /// @dev Renouncing would permanently freeze role management; disabled.
    function renounceOwnership() public view override onlyOwner {
        revert Unsupported();
    }

    function _setToken(address token, bool allowed) private {
        if (token == address(0)) revert ZeroAddress();
        isTokenAllowed[token] = allowed;
        emit TokenAllowlistUpdated(token, allowed);
    }

    /// @notice Invalidate one of the caller's own unused signed authorizations (e.g. a payout
    ///         approval the maintainer changed their mind about).
    function invalidateNonce(uint256 nonce) external {
        usedAuthNonce[msg.sender][nonce] = true;
        emit NonceInvalidated(msg.sender, nonce);
    }

    /*//////////////////////////////////////////////////////////////
                                 FUNDING
    //////////////////////////////////////////////////////////////*/

    /// @notice Fund a bounty from the caller's wallet (needs prior token approval).
    ///         Caller must be a maintainer or the owner.
    function fund(Terms calldata terms) external nonReentrant {
        _recordFunding(terms, msg.sender);
        _pullApproved(terms.token, msg.sender, terms.amount);
    }

    /// @notice Gasless funding: pull the funder's EIP-3009 authorization (`receiveWithAuthorization`)
    ///         addressed to this contract. The 3009 nonce MUST equal `hashTerms(terms, funder)`, so
    ///         the funder's single signature commits to the exact bounty terms and no relayer can
    ///         attach those funds to different terms. Anyone may relay (the relayer pays gas).
    function fundWithAuthorization(
        Terms calldata terms,
        address funder,
        uint256 validAfter,
        uint256 validBefore,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        bytes32 termsHash = _recordFunding(terms, funder);
        IERC20 token = IERC20(terms.token);
        uint256 balanceBefore = token.balanceOf(address(this));
        IERC3009(terms.token).receiveWithAuthorization(
            funder, address(this), terms.amount, validAfter, validBefore, termsHash, v, r, s
        );
        _checkReceived(token, balanceBefore, terms.amount);
    }

    /// @notice The EIP-712 hash of the funding terms for a funder. Use as the 3009 nonce.
    function hashTerms(Terms calldata terms, address funder) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    TERMS_TYPEHASH,
                    terms.bountyId,
                    funder,
                    terms.token,
                    terms.amount,
                    terms.criteriaHash,
                    terms.repoRef,
                    terms.submissionDeadline
                )
            )
        );
    }

    function _recordFunding(Terms calldata t, address funder) private returns (bytes32 termsHash) {
        if (!_hasMaintainerRole(funder)) revert NotMaintainer(funder);
        if (!isTokenAllowed[t.token]) revert TokenNotAllowed(t.token);
        if (
            t.bountyId == bytes32(0) || t.amount == 0 || t.criteriaHash == bytes32(0)
                || t.submissionDeadline <= block.timestamp
        ) revert InvalidTerms();
        Bounty storage b = _bounties[t.bountyId];
        if (b.status != Status.Draft) revert BountyExists(t.bountyId);

        termsHash = hashTerms(t, funder);
        b.funder = funder;
        b.status = Status.Funded;
        b.submissionDeadline = t.submissionDeadline;
        b.token = t.token;
        b.amount = t.amount;
        b.criteriaHash = t.criteriaHash;
        b.repoRef = t.repoRef;
        b.termsHash = termsHash;

        emit BountyFunded(
            t.bountyId, funder, t.token, t.amount, t.criteriaHash, t.repoRef, t.submissionDeadline, termsHash
        );
    }

    function _pullApproved(address tokenAddr, address from, uint256 amount) private {
        IERC20 token = IERC20(tokenAddr);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        _checkReceived(token, balanceBefore, amount);
    }

    /// @dev Rejects fee-on-transfer / rebasing behaviour that would leave the escrow under-funded.
    function _checkReceived(IERC20 token, uint256 balanceBefore, uint256 expected) private view {
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        if (received != expected) revert UnexpectedTransferAmount(expected, received);
    }

    /*//////////////////////////////////////////////////////////////
                                 CLAIMS
    //////////////////////////////////////////////////////////////*/

    /// @notice Atomically accept exactly one claimant and bind the payout wallet.
    ///         Authority: a maintainer/owner via `auth`. A contributor cannot accept for themselves.
    function acceptClaim(bytes32 bountyId, address recipient, Auth calldata auth) external {
        Bounty storage b = _bounties[bountyId];
        _releaseIfExpired(bountyId, b);
        if (b.status != Status.Funded) revert BadStatus(b.status);
        if (block.timestamp >= b.submissionDeadline) revert DeadlinePassed();

        uint32 newVersion = b.claimVersion + 1;
        _consumeAuth(
            auth, keccak256(abi.encode(ACCEPT_CLAIM_TYPEHASH, bountyId, recipient, newVersion, auth.nonce, auth.deadline))
        );
        if (!_hasMaintainerRole(auth.signer)) revert NotMaintainer(auth.signer);
        if (recipient == address(0) || recipient == address(this) || recipient == b.token) revert InvalidRecipient();
        // Same-account self-payment is disallowed (not a Sybil defence).
        if (recipient == b.funder || recipient == auth.signer) revert SelfPayment();

        uint256 deadlineCap = block.timestamp + CLAIM_WINDOW;
        uint64 expiry = b.submissionDeadline < deadlineCap ? b.submissionDeadline : uint64(deadlineCap);

        b.status = Status.Claimed;
        b.claimVersion = newVersion;
        b.recipient = recipient;
        b.claimExpiry = expiry;

        emit ClaimAccepted(bountyId, newVersion, recipient, auth.signer, expiry);
    }

    /// @notice Release a claim that expired (72h after acceptance or the submission deadline,
    ///         whichever is first) without a registered submission. Permissionless. Does NOT refund.
    function expireClaim(bytes32 bountyId) external {
        Bounty storage b = _bounties[bountyId];
        if (!_isClaimExpired(b)) revert ClaimNotExpired();
        _releaseIfExpired(bountyId, b);
    }

    /// @notice Register the claimant's PR as the submission, protecting the claim through review.
    ///         The backend attests that the claimant's PR exists and was linked in time; anyone may
    ///         relay the attestation. Must happen before the claim expires.
    function registerSubmission(bytes32 bountyId, uint32 claimVersion, bytes32 submissionRef, Attestation calldata att)
        external
    {
        Bounty storage b = _bounties[bountyId];
        if (b.status != Status.Claimed) revert BadStatus(b.status);
        if (_isClaimExpired(b)) revert ClaimHasExpired();
        if (claimVersion != b.claimVersion) revert ClaimVersionMismatch(b.claimVersion, claimVersion);
        if (submissionRef == bytes32(0)) revert InvalidTerms();

        _consumeAttestation(
            att,
            keccak256(
                abi.encode(
                    SUBMISSION_ATTESTATION_TYPEHASH,
                    bountyId,
                    claimVersion,
                    b.recipient,
                    submissionRef,
                    att.nonce,
                    att.expiry
                )
            )
        );

        b.status = Status.Submitted;
        b.submissionRef = submissionRef;
        emit SubmissionRegistered(bountyId, claimVersion, b.recipient, submissionRef, att.nonce);
    }

    /*//////////////////////////////////////////////////////////////
                               SETTLEMENT
    //////////////////////////////////////////////////////////////*/

    /// @notice Pay the bound recipient exactly once. Requires BOTH:
    ///         - `approval`: a human maintainer (holding maintainer + settlement-wallet flags, or the
    ///           owner) signed a `PayoutApproval` over the settlement facts; and
    ///         - `att`: the backend attestation signer signed a `SettlementAttestation` over the same
    ///           facts, expiring within `MAX_ATTESTATION_TTL`.
    ///         Callable by anyone (relayers/sponsors): authority is only ever the recovered signers.
    function settle(Settlement calldata s, Attestation calldata att, Auth calldata approval) external nonReentrant {
        Bounty storage b = _bounties[s.bountyId];
        if (b.status != Status.Submitted) revert BadStatus(b.status);
        // Everything signed must equal what is locked onchain; nothing is taken from calldata blindly.
        if (s.claimVersion != b.claimVersion) revert ClaimVersionMismatch(b.claimVersion, s.claimVersion);
        if (s.recipient != b.recipient || s.amount != b.amount || s.criteriaHash != b.criteriaHash) {
            revert SettlementMismatch();
        }
        if (s.reviewedSha == bytes32(0) || s.mergeRef == bytes32(0) || s.reportHash == bytes32(0)) {
            revert SettlementMismatch();
        }

        _consumeAttestation(
            att,
            keccak256(
                abi.encode(
                    SETTLEMENT_ATTESTATION_TYPEHASH,
                    s.bountyId,
                    s.claimVersion,
                    s.recipient,
                    s.amount,
                    s.criteriaHash,
                    s.reviewedSha,
                    s.mergeRef,
                    s.reportHash,
                    att.nonce,
                    att.expiry
                )
            )
        );
        _consumeAuth(
            approval,
            keccak256(
                abi.encode(
                    PAYOUT_APPROVAL_TYPEHASH,
                    s.bountyId,
                    s.claimVersion,
                    s.recipient,
                    s.amount,
                    s.criteriaHash,
                    s.reviewedSha,
                    s.mergeRef,
                    s.reportHash,
                    approval.nonce,
                    approval.deadline
                )
            )
        );
        if (!_canAuthorizePayout(approval.signer)) revert NotPayoutAuthority(approval.signer);
        if (approval.signer == b.recipient) revert SelfPayment();

        // Effects before interaction; status flips first so no path can pay twice.
        b.status = Status.Paid;
        address token = b.token;
        address recipient = b.recipient;
        uint256 amount = b.amount;
        IERC20(token).safeTransfer(recipient, amount);

        emit PayoutSettled(
            s.bountyId,
            s.claimVersion,
            recipient,
            token,
            amount,
            s.criteriaHash,
            s.reviewedSha,
            s.mergeRef,
            s.reportHash,
            approval.signer,
            attestationSigner,
            att.nonce
        );
    }

    /*//////////////////////////////////////////////////////////////
                           REFUNDS AND CANCELLATION
    //////////////////////////////////////////////////////////////*/

    /// @notice Return the reward to the ORIGINAL FUNDER (never the caller/signer) when there is no
    ///         active claim: before any claim, after a claim expired, or after the submission deadline
    ///         with no protected submission. Authority: the funder or a maintainer/owner.
    ///         Claimed (unexpired) and Submitted bounties cannot use this path.
    function refund(bytes32 bountyId, Auth calldata auth) external nonReentrant {
        Bounty storage b = _bounties[bountyId];
        _releaseIfExpired(bountyId, b);
        if (b.status != Status.Funded) revert BadStatus(b.status);

        _consumeAuth(auth, keccak256(abi.encode(REFUND_TYPEHASH, bountyId, auth.nonce, auth.deadline)));
        if (auth.signer != b.funder && !_hasMaintainerRole(auth.signer)) revert NotRefundAuthority(auth.signer);

        RefundReason reason =
            block.timestamp >= b.submissionDeadline ? RefundReason.DeadlinePassed : RefundReason.NoActiveClaim;
        _refund(bountyId, b, reason, auth.signer);
    }

    /// @notice Cancel claimed or submitted work by mutual agreement. Both a funder-side party (the
    ///         funder or a maintainer/owner) and the bound claimant sign `CancelByAgreement` for the
    ///         current claim version. The reward returns to the original funder.
    function cancelByAgreement(bytes32 bountyId, uint32 claimVersion, Auth calldata funderSide, Auth calldata claimant)
        external
        nonReentrant
    {
        Bounty storage b = _bounties[bountyId];
        _releaseIfExpired(bountyId, b);
        if (b.status != Status.Claimed && b.status != Status.Submitted) revert BadStatus(b.status);
        if (claimVersion != b.claimVersion) revert ClaimVersionMismatch(b.claimVersion, claimVersion);

        _consumeAuth(
            funderSide,
            keccak256(abi.encode(CANCEL_TYPEHASH, bountyId, claimVersion, funderSide.nonce, funderSide.deadline))
        );
        _consumeAuth(
            claimant, keccak256(abi.encode(CANCEL_TYPEHASH, bountyId, claimVersion, claimant.nonce, claimant.deadline))
        );
        if (funderSide.signer != b.funder && !_hasMaintainerRole(funderSide.signer)) {
            revert NotRefundAuthority(funderSide.signer);
        }
        if (claimant.signer != b.recipient) revert InvalidRecipient();
        if (funderSide.signer == claimant.signer) revert PartiesNotDistinct();

        _refund(bountyId, b, RefundReason.MutualCancellation, funderSide.signer);
    }

    function _refund(bytes32 bountyId, Bounty storage b, RefundReason reason, address authorizedBy) private {
        b.status = Status.Refunded;
        address funder = b.funder;
        address token = b.token;
        uint256 amount = b.amount;
        IERC20(token).safeTransfer(funder, amount);
        emit BountyRefunded(bountyId, funder, token, amount, reason, authorizedBy);
    }

    /*//////////////////////////////////////////////////////////////
                                  VIEWS
    //////////////////////////////////////////////////////////////*/

    function getBounty(bytes32 bountyId) external view returns (Bounty memory) {
        return _bounties[bountyId];
    }

    /// @notice Status with lazy claim expiry applied (a Claimed bounty past its expiry reads Funded).
    function effectiveStatus(bytes32 bountyId) external view returns (Status) {
        Bounty storage b = _bounties[bountyId];
        return _isClaimExpired(b) ? Status.Funded : b.status;
    }

    function hasMaintainerRole(address account) external view returns (bool) {
        return _hasMaintainerRole(account);
    }

    function canAuthorizePayout(address account) external view returns (bool) {
        return _canAuthorizePayout(account);
    }

    /*//////////////////////////////////////////////////////////////
                                INTERNALS
    //////////////////////////////////////////////////////////////*/

    function _hasMaintainerRole(address account) private view returns (bool) {
        return account != address(0) && (account == owner() || isMaintainer[account]);
    }

    function _canAuthorizePayout(address account) private view returns (bool) {
        return account != address(0) && (account == owner() || (isMaintainer[account] && isSettlementWallet[account]));
    }

    function _isClaimExpired(Bounty storage b) private view returns (bool) {
        return b.status == Status.Claimed && block.timestamp >= b.claimExpiry;
    }

    /// @dev Lazily release an expired, unsubmitted claim so the bounty reads as Funded again.
    function _releaseIfExpired(bytes32 bountyId, Bounty storage b) private {
        if (_isClaimExpired(b)) {
            address recipient = b.recipient;
            b.status = Status.Funded;
            b.recipient = address(0);
            b.claimExpiry = 0;
            emit ClaimExpired(bountyId, b.claimVersion, recipient);
        }
    }

    /// @dev Verifies a human authorization over `structHash`. If `signer == msg.sender` the caller
    ///      authenticates itself (EOA or smart account calling directly); otherwise the signature is
    ///      checked with ECDSA / ERC-1271 against the EIP-712 digest. Either way the nonce is consumed
    ///      and the deadline enforced, so the relayer's own address never confers authority.
    function _consumeAuth(Auth calldata a, bytes32 structHash) private {
        if (a.signer == address(0)) revert ZeroAddress();
        if (a.deadline < block.timestamp) revert AuthExpired();
        if (a.deadline > block.timestamp + MAX_AUTH_TTL) revert AuthTtlTooLong();
        if (usedAuthNonce[a.signer][a.nonce]) revert NonceAlreadyUsed();
        if (a.signer != msg.sender) {
            if (!SignatureChecker.isValidSignatureNow(a.signer, _hashTypedDataV4(structHash), a.signature)) {
                revert InvalidSignature();
            }
        }
        usedAuthNonce[a.signer][a.nonce] = true;
    }

    function _consumeAttestation(Attestation calldata a, bytes32 structHash) private {
        if (a.expiry < block.timestamp) revert AttestationExpired();
        if (a.expiry > block.timestamp + MAX_ATTESTATION_TTL) revert AttestationTtlTooLong();
        address signer = attestationSigner;
        if (usedAttestationNonce[signer][a.nonce]) revert NonceAlreadyUsed();
        if (!SignatureChecker.isValidSignatureNow(signer, _hashTypedDataV4(structHash), a.signature)) {
            revert InvalidSignature();
        }
        usedAttestationNonce[signer][a.nonce] = true;
    }
}
