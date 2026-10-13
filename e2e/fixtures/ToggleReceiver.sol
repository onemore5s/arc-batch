// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Receiver for local end-to-end tests only; excluded from production deployment artifacts.
contract ToggleReceiver {
    bool public rejected;

    function setRejected(bool value) external {
        rejected = value;
    }

    receive() external payable {
        require(!rejected);
    }
}
