// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// The EIP-3009 surface of USDC (FiatToken v2.2) used here
interface IERC3009 {
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
}

contract VerifierRegistryUSDC is Ownable {
    using SafeERC20 for IERC20;

    // A signed EIP-3009 TransferWithAuthorization whose `to` is this contract
    struct Authorization {
        address from;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        bytes signature;
    }

    // Same event as VerifierRegistry, so existing readers decode both. `paid` is in token units.
    event Anchored(string indexed cidIndex, string cid, string filename, address submitter, uint256 timestamp, uint256 paid);
    event PriceSet(uint256 price);
    event RelayerSet(address indexed relayer, bool allowed);

    // The first anchor of a cid, kept in one storage slot
    struct Record {
        address submitter;
        uint48 timestamp;
        uint48 blockNumber;
    }

    IERC20 public immutable token;
    uint256 public price;
    mapping(address => bool) public relayers;
    // payer => authorization nonce => anchored
    mapping(address => mapping(bytes32 => bool)) public settled;
    // keccak256(cid) => first anchor. The key equals topic 1 of the Anchored event, so the full
    // proof is the log with that topic in block `blockNumber`: a lookup needs no range search.
    mapping(bytes32 => Record) public records;

    constructor(address initialOwner, address _token, uint256 _price) Ownable(initialOwner) {
        require(_token != address(0), "token: zero address");
        token = IERC20(_token);
        price = _price;
        emit PriceSet(_price);
    }

    function setPrice(uint256 _price) external onlyOwner {
        price = _price;
        emit PriceSet(_price);
    }

    function setRelayer(address relayer, bool allowed) external onlyOwner {
        relayers[relayer] = allowed;
        emit RelayerSet(relayer, allowed);
    }

    function withdraw(IERC20 asset, address to) external onlyOwner {
        asset.safeTransfer(to, asset.balanceOf(address(this)));
    }

    // The first anchor of `cid`; all zeros when it was never anchored here
    function firstAnchor(string calldata cid) external view returns (address submitter, uint256 timestamp, uint256 blockNumber) {
        Record storage record = records[keccak256(bytes(cid))];
        return (record.submitter, record.timestamp, record.blockNumber);
    }

    // Later anchors of the same cid emit the event and leave the record as it is
    function _anchor(string calldata cid, string calldata filename, address submitter, uint256 paid) private {
        Record storage record = records[keccak256(bytes(cid))];
        if (record.timestamp == 0) {
            record.submitter = submitter;
            record.timestamp = uint48(block.timestamp);
            record.blockNumber = uint48(block.number);
        }
        emit Anchored(cid, cid, filename, submitter, block.timestamp, paid);
    }

    // Pay with an allowance: approve this contract for `price`, then call
    function anchor(string calldata cid, string calldata filename) external {
        uint256 paid = price;
        token.safeTransferFrom(msg.sender, address(this), paid);
        _anchor(cid, filename, msg.sender, paid);
    }

    // Pay with a signed authorization, in the same transaction as the anchor.
    // The signature does not commit to `cid`, so only the payer or a relayer may pair them.
    function anchorWithAuthorization(string calldata cid, string calldata filename, Authorization calldata auth) external {
        require(msg.sender == auth.from || relayers[msg.sender], "not payer or relayer");
        require(auth.value >= price, "price not met");
        settled[auth.from][auth.nonce] = true;
        IERC3009(address(token)).transferWithAuthorization(
            auth.from,
            address(this),
            auth.value,
            auth.validAfter,
            auth.validBefore,
            auth.nonce,
            auth.signature
        );
        _anchor(cid, filename, auth.from, auth.value);
    }

    // Anchor against an authorization that was already executed on the token (by a facilitator,
    // or by someone who front-ran the relayer). The relayer vouches that it paid this contract `value`.
    function anchorPaid(string calldata cid, string calldata filename, address from, uint256 value, bytes32 nonce) external {
        require(relayers[msg.sender], "not relayer");
        require(value >= price, "price not met");
        require(IERC3009(address(token)).authorizationState(from, nonce), "authorization not used");
        require(!settled[from][nonce], "already anchored");
        settled[from][nonce] = true;
        _anchor(cid, filename, from, value);
    }
}
