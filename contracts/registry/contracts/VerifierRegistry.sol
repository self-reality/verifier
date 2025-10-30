// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract VerifierRegistry {
    event Anchored(address indexed submitter, string cid, string filename, uint256 timestamp);

    struct Entry {
        address submitter;
        string cid;
        string filename;
        uint256 timestamp;
    }

    Entry[] public entries;

    function anchor(string calldata cid, string calldata filename) external {
        entries.push(Entry({
            submitter: msg.sender,
            cid: cid,
            filename: filename,
            timestamp: block.timestamp
        }));
        emit Anchored(msg.sender, cid, filename, block.timestamp);
    }

    function entriesLength() external view returns (uint256) {
        return entries.length;
    }
}


