// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract VerifierRegistry is Ownable {
    constructor(address initialOwner, uint256 _minFee, uint256 _maxFee) Ownable(initialOwner) {
        require(_minFee <= _maxFee, "fee bounds: min > max");
        minFee = _minFee;
        maxFee = _maxFee;
    }

    event Anchored(address indexed submitter, string indexed cid, string indexed filename, uint256 timestamp, uint256 paid);
    event AnchoredCidOnly(address indexed submitter, string indexed cid, uint256 timestamp, uint256 paid);
    event AnchoredBytes32(address indexed submitter, bytes32 indexed hash, uint256 timestamp, uint256 paid);

    uint256 public minFee;
    uint256 public maxFee;

    function setFeeRange(uint256 _minFee, uint256 _maxFee) external onlyOwner {
        require(_minFee <= _maxFee, "fee bounds: min > max");
        minFee = _minFee;
        maxFee = _maxFee;
    }

    function withdrawFees(address payable to) external onlyOwner {
        (bool sent, ) = to.call{value: address(this).balance}("");
        require(sent, "withdraw failed");
    }

    function anchor(string calldata cid, string calldata filename) external payable {
        require(msg.value >= minFee && msg.value <= maxFee, "fee not met");
        emit Anchored(msg.sender, cid, filename, block.timestamp, msg.value);
    }

    // Version with only CID (no filename, no validation)
    function anchorCidOnly(string calldata cid) external payable {
        require(msg.value >= minFee && msg.value <= maxFee, "fee not met");
        emit AnchoredCidOnly(msg.sender, cid, block.timestamp, msg.value);
    }

    // Version with bytes32 hash (no filename, no validation, optimized storage)
    function anchorBytes32(bytes32 hash) external payable {
        require(msg.value >= minFee && msg.value <= maxFee, "fee not met");
        emit AnchoredBytes32(msg.sender, hash, block.timestamp, msg.value);
    }
}


