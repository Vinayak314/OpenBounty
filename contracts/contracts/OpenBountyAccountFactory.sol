// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {P256} from "@openzeppelin/contracts/utils/cryptography/P256.sol";
import {OpenBountyAccount} from "./OpenBountyAccount.sol";

/// @title OpenBounty passkey account factory
/// @notice Deploys one `OpenBountyAccount` per passkey public key at a CREATE2 address that can be
///         computed before deployment. Permissionless and idempotent: the gas sponsor deploys accounts,
///         but the address depends only on the public key, so nobody can deploy a different account there.
contract OpenBountyAccountFactory {
    event AccountCreated(address indexed account, bytes32 qx, bytes32 qy);

    error InvalidPublicKey();

    function createAccount(bytes32 qx, bytes32 qy) external returns (address account) {
        account = accountAddress(qx, qy);
        if (account.code.length > 0) return account;
        if (!P256.isValidPublicKey(qx, qy)) revert InvalidPublicKey();
        account = address(new OpenBountyAccount{salt: _salt(qx, qy)}(qx, qy));
        emit AccountCreated(account, qx, qy);
    }

    function accountAddress(bytes32 qx, bytes32 qy) public view returns (address) {
        return Create2.computeAddress(
            _salt(qx, qy), keccak256(abi.encodePacked(type(OpenBountyAccount).creationCode, abi.encode(qx, qy)))
        );
    }

    function _salt(bytes32 qx, bytes32 qy) private pure returns (bytes32) {
        return keccak256(abi.encode(qx, qy));
    }
}
