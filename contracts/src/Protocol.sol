// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

library Protocol {
    uint256 internal constant NATIVE_DECIMALS = 18;
    uint256 internal constant REWARD_DECIMALS = 6;
    uint256 internal constant AMOUNT_STEP = 10 ** (NATIVE_DECIMALS - REWARD_DECIMALS);
    string internal constant VERSION = "1.0.0";
}
