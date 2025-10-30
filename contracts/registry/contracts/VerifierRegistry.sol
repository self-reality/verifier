// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VerifierRegistry {
    event Anchored(address indexed submitter, string cid, string filename, uint256 timestamp);

    function anchor(string calldata cid, string calldata filename) external {
        _validateFilename(filename);
        emit Anchored(msg.sender, cid, filename, block.timestamp);
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
                (c >= 0x61 && c <= 0x7A) || // a-z
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
}


