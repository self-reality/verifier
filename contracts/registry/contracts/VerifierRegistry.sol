// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract VerifierRegistry is Ownable {
    constructor(address initialOwner, uint256 _minFee, uint256 _maxFee) Ownable(initialOwner) {
        require(_minFee <= _maxFee, "fee bounds: min > max");
        minFee = _minFee;
        maxFee = _maxFee;
    }

    event Anchored(string indexed cidIndex, string cid, string filename, address submitter,  uint256 timestamp, uint256 paid);
    event AnchoredBytes32(bytes32 indexed hashIndex, bytes32 hash, address submitter, uint256 timestamp, uint256 paid);

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
        emit Anchored(cid, cid, filename, msg.sender, block.timestamp, msg.value);
    }

    // Version with only CID (no filename, no validation)
    function anchorCidOnly(string calldata cid) external payable {
        require(msg.value >= minFee && msg.value <= maxFee, "fee not met");
        emit Anchored(cid, cid, "", msg.sender, block.timestamp, msg.value);
    }

    // Version with bytes32 hash (no filename, no validation, optimized storage)
    function anchorBytes32(bytes32 hash) external payable {
        require(msg.value >= minFee && msg.value <= maxFee, "fee not met");
        emit AnchoredBytes32(hash, hash, msg.sender, block.timestamp, msg.value);
    }
}


