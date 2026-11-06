// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import {WebAuthn} from "@openzeppelin/contracts/utils/cryptography/WebAuthn.sol";

/// @title OpenBounty passkey account
/// @notice A minimal smart account controlled by one WebAuthn passkey (secp256r1). There is no seed
///         phrase and the account never needs the gas token: anyone (the OpenBounty gas sponsor) may
///         submit `execute`, but only a fresh passkey assertion over the exact call batch authorizes it.
///
/// @dev    AUTHORITY. The only authority is the passkey public key fixed at deployment. The relayer
///         that pays gas cannot change targets, values, calldata, the nonce or the deadline: all of them
///         are inside the EIP-712 digest the passkey signs. The domain binds chain id and this account's
///         address, so a signature cannot be replayed on another chain or another account.
///
///         ERC-1271. `isValidSignature` accepts a passkey assertion whose challenge is the given hash.
///         This lets the escrow verify off-chain-signed authorizations from this account (for example a
///         claimant's consent to a mutual cancellation) through OpenZeppelin `SignatureChecker`.
///
///         Not upgradeable, no owner, no recovery: losing the passkey loses the account. Passkeys synced
///         by the platform (iCloud Keychain, Google Password Manager) mitigate this; see the README.
contract OpenBountyAccount is EIP712, IERC1271 {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    bytes32 public constant CALL_TYPEHASH = keccak256("Call(address target,uint256 value,bytes data)");
    bytes32 public constant EXECUTE_TYPEHASH =
        keccak256("Execute(Call[] calls,uint256 nonce,uint256 deadline)Call(address target,uint256 value,bytes data)");
    /// @dev Passkey signatures for `execute` must expire within this window.
    uint256 public constant MAX_EXECUTE_TTL = 1 hours;

    bytes32 public immutable qx;
    bytes32 public immutable qy;

    /// @notice Sequential nonce consumed by every successful `execute`.
    uint256 public nonce;

    event Executed(uint256 indexed nonce, uint256 calls, address indexed relayer);

    error ExecutionExpired();
    error ExecutionTtlTooLong();
    error InvalidSignature();
    error EmptyBatch();
    error CallFailed(uint256 index, bytes reason);

    constructor(bytes32 qx_, bytes32 qy_) EIP712("OpenBountyAccount", "1") {
        qx = qx_;
        qy = qy_;
    }

    /// @notice Run a batch of calls from this account, authorized by one passkey assertion.
    /// @param signature ABI-encoded `WebAuthn.WebAuthnAuth` whose challenge is `executeDigest(...)`.
    function execute(Call[] calldata calls, uint256 deadline, bytes calldata signature)
        external
        returns (bytes[] memory results)
    {
        if (calls.length == 0) revert EmptyBatch();
        if (deadline < block.timestamp) revert ExecutionExpired();
        if (deadline > block.timestamp + MAX_EXECUTE_TTL) revert ExecutionTtlTooLong();
        uint256 current = nonce;
        if (!_verify(executeDigest(calls, current, deadline), signature)) revert InvalidSignature();
        nonce = current + 1;

        results = new bytes[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            (bool ok, bytes memory ret) = calls[i].target.call{value: calls[i].value}(calls[i].data);
            if (!ok) revert CallFailed(i, ret);
            results[i] = ret;
        }
        emit Executed(current, calls.length, msg.sender);
    }

    /// @notice EIP-712 digest the passkey signs for a batch.
    function executeDigest(Call[] calldata calls, uint256 nonce_, uint256 deadline) public view returns (bytes32) {
        bytes32[] memory hashes = new bytes32[](calls.length);
        for (uint256 i = 0; i < calls.length; i++) {
            hashes[i] = keccak256(abi.encode(CALL_TYPEHASH, calls[i].target, calls[i].value, keccak256(calls[i].data)));
        }
        return _hashTypedDataV4(
            keccak256(abi.encode(EXECUTE_TYPEHASH, keccak256(abi.encodePacked(hashes)), nonce_, deadline))
        );
    }

    /// @inheritdoc IERC1271
    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return _verify(hash, signature) ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }

    function _verify(bytes32 hash, bytes calldata signature) private view returns (bool) {
        if (signature.length < 192) return false;
        WebAuthn.WebAuthnAuth memory auth = abi.decode(signature, (WebAuthn.WebAuthnAuth));
        // User verification (biometric/PIN) is required: every payment action is an explicit human approval.
        return WebAuthn.verify(abi.encodePacked(hash), auth, qx, qy, true);
    }
}
