// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {BountyEscrow} from "../BountyEscrow.sol";

/// @notice Test-only token that checks the escrow's state at the exact point of an outbound transfer.
contract EscrowTransferProbe is ERC20 {
    BountyEscrow private escrow;
    bytes32 private bountyId;
    BountyEscrow.Status private expectedStatus;
    bool private failTransfer;
    uint256 public observedTransfers;

    error WrongStatus(BountyEscrow.Status actual, BountyEscrow.Status expected);
    error TransferRejected();

    constructor() ERC20("Escrow transfer probe", "PROBE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function watch(
        BountyEscrow escrow_,
        bytes32 bountyId_,
        BountyEscrow.Status expectedStatus_,
        bool failTransfer_
    ) external {
        escrow = escrow_;
        bountyId = bountyId_;
        expectedStatus = expectedStatus_;
        failTransfer = failTransfer_;
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && from == address(escrow)) {
            BountyEscrow.Status actual = escrow.getBounty(bountyId).status;
            if (actual != expectedStatus) revert WrongStatus(actual, expectedStatus);
            observedTransfers++;
            if (failTransfer) revert TransferRejected();
        }
        super._update(from, to, amount);
    }
}
