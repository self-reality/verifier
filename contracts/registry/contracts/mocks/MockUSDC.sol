// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// Test token: an ERC-20 with the EIP-3009 functions and EIP-712 domain of USDC on Base
contract MockUSDC is ERC20, EIP712 {
    bytes32 public constant TRANSFER_WITH_AUTHORIZATION_TYPEHASH =
        keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");

    mapping(address => mapping(bytes32 => bool)) private _authorizationStates;

    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    constructor() ERC20("USD Coin", "USDC") EIP712("USD Coin", "2") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function version() external pure returns (string memory) {
        return "2";
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce];
    }

    // Simplified: the real token takes the authorizer's signature instead of msg.sender
    function cancelAuthorization(bytes32 nonce) external {
        require(!_authorizationStates[msg.sender][nonce], "FiatTokenV2: authorization is used or canceled");
        _authorizationStates[msg.sender][nonce] = true;
        emit AuthorizationCanceled(msg.sender, nonce);
    }

    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external {
        require(block.timestamp > validAfter, "FiatTokenV2: authorization is not yet valid");
        require(block.timestamp < validBefore, "FiatTokenV2: authorization is expired");
        require(!_authorizationStates[from][nonce], "FiatTokenV2: authorization is used or canceled");
        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce))
        );
        require(ECDSA.recover(digest, signature) == from, "FiatTokenV2: invalid signature");
        _authorizationStates[from][nonce] = true;
        emit AuthorizationUsed(from, nonce);
        _transfer(from, to, value);
    }
}
