// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Minimal EIP-3009 surface used by the escrow for gasless funding.
/// @dev `receiveWithAuthorization` requires `msg.sender == to`, so only the escrow
///      itself can pull a signed authorization addressed to it (no front-running by
///      third parties who would otherwise be able to submit a bare transfer).
///      The live designated USDT implementation contains the selector 0xef55bec6 for
///      this function (checked in its deployed bytecode); it has not been called on
///      chain by this repo, so the behaviour is only verified against a local mock.
interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}
