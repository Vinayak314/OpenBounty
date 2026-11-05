// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice FOR LOCAL TESTS ONLY. Never deploy this to a real network: it has an open `mint`.
///         The real, designated test USDT on Whitechain Sepolia is
///         0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 and must be used for the track demo
///         ("payments in a test token you minted yourself won't count").
///         This mock mimics the USDT surface the escrow touches: 6 decimals and the EIP-3009
///         `receiveWithAuthorization` flow. Its EIP-712 domain ("Tether USD", "1") was matched
///         against the live token's `DOMAIN_SEPARATOR()` (chain 1874, verifyingContract = the token
///         proxy). The live token reverts on `version()`, so off-chain signers should still read
///         `DOMAIN_SEPARATOR()` rather than reconstructing the domain.
contract MockUSDT is ERC20, EIP712 {
    bytes32 public constant RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    mapping(address authorizer => mapping(bytes32 nonce => bool)) public authorizationState;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);

    constructor() ERC20("Tether USD", "USDT") EIP712("Tether USD", "1") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

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
    ) external {
        require(to == msg.sender, "MockUSDT: caller must be the payee");
        require(block.timestamp > validAfter, "MockUSDT: authorization is not yet valid");
        require(block.timestamp < validBefore, "MockUSDT: authorization is expired");
        require(!authorizationState[from][nonce], "MockUSDT: authorization is used");

        bytes32 structHash =
            keccak256(abi.encode(RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce));
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), v, r, s);
        require(signer == from, "MockUSDT: invalid signature");

        authorizationState[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }
}
