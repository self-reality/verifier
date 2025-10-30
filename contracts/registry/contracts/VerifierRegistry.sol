// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract VerifierRegistry is Ownable {
    constructor(address initialOwner) Ownable(initialOwner) {}

    event Anchored(address indexed submitter, string cid, string filename, uint256 timestamp, uint256 paid);

    uint256 public minFee = 0.0000025 ether; // 1 cent at ETHUSD 4000
    uint256 public maxFee = 0.0013 ether; // $5 at ETHUSD 4000

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
        _validateFilename(filename);
        _validateCidV1(cid);
        emit Anchored(msg.sender, cid, filename, block.timestamp, msg.value);
    }

    function _validateFilename(string calldata filename) internal pure {
        bytes memory b = bytes(filename);
        uint256 len = b.length;
        require(len > 0, "filename empty");
        require(len <= 128, "filename too long");
        // Allowed: lowercase a-z, 0-9, '-', '_', '.'
        // Disallowed: '~', spaces, uppercase letters, other symbols
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            if (
                _isLowercaseAZ(c) || // a-z
                (c >= 0x30 && c <= 0x39) || // 0-9
                c == 0x2D || // '-'
                c == 0x5F || // '_'
                c == 0x2E // '.'
            ) {
                continue;
            }
            revert("filename invalid char");
        }
        // additional simple constraints: no leading/trailing '-' or '.'
        require(b[0] != 0x2D && b[0] != 0x2E, "filename bad start");
        require(b[len - 1] != 0x2D && b[len - 1] != 0x2E, "filename bad end");
    }

    function _isLowercaseAZ(bytes1 c) internal pure returns (bool) {
        return (c >= 0x61 && c <= 0x7A);
    }

    // CIDv1 base32 (sha2-256 32 bytes) is usually 59 chars and starts with 'bafy', uses base32 [a-z2-7]
    function _validateCidV1(string calldata cid) internal pure {
        bytes memory b = bytes(cid);
        uint256 len = b.length;
        require(len >= 59 && len <= 63, "cidv1: bad length");
        // must start with 'bafy'
        require(b[0] == 0x62 && b[1] == 0x61 && b[2] == 0x66 && b[3] == 0x79, "cidv1: bad prefix");
        // check base32 (a-z, 2-7)
        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            if (
                _isLowercaseAZ(c) || // a-z
                (c >= 0x32 && c <= 0x37) // 2-7
            ) {
                continue;
            }
            revert("cidv1: invalid char");
        }
    }
}


