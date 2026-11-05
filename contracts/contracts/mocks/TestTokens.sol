// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice FOR LOCAL TESTS ONLY. ERC-20 that burns 1% on every transfer, used to prove the
///         escrow rejects fee-on-transfer tokens instead of becoming under-collateralised.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// @notice FOR LOCAL TESTS ONLY. ERC-20 with a transfer hook (like ERC-777 / callback tokens) that
///         can re-enter a target contract once, recording whether the re-entrant call succeeded.
contract ReentrantToken is ERC20 {
    address public target;
    bytes public payload;
    bool public armed;
    bool public attackAttempted;
    bool public attackSucceeded;
    bytes public attackRevertData;

    constructor() ERC20("Reentrant Token", "RE") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @dev The next transfer triggers `target.call(payload)` exactly once.
    function arm(address target_, bytes calldata payload_) external {
        target = target_;
        payload = payload_;
        armed = true;
        attackAttempted = false;
        attackSucceeded = false;
        delete attackRevertData;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from != address(0) && to != address(0)) {
            armed = false; // one-shot, avoids infinite recursion
            attackAttempted = true;
            (bool ok, bytes memory ret) = target.call(payload);
            attackSucceeded = ok;
            attackRevertData = ret;
        }
    }
}

/// @notice FOR LOCAL TESTS ONLY. Minimal ERC-1271 smart account controlled by one EOA, used to
///         prove relayed authorizations are verified by signature rather than by msg.sender.
contract MockSmartAccount {
    address public immutable controller;

    constructor(address controller_) {
        controller = controller_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        if (signature.length != 65) return 0xffffffff;
        bytes32 r = bytes32(signature[0:32]);
        bytes32 s = bytes32(signature[32:64]);
        uint8 v = uint8(signature[64]);
        address recovered = ecrecover(hash, v, r, s);
        return recovered != address(0) && recovered == controller ? bytes4(0x1626ba7e) : bytes4(0xffffffff);
    }

    /// @dev Lets the controller make the account call a contract directly (msg.sender == account).
    function execute(address to, bytes calldata data) external returns (bytes memory) {
        require(msg.sender == controller, "MockSmartAccount: not controller");
        (bool ok, bytes memory ret) = to.call(data);
        if (!ok) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
        return ret;
    }
}
