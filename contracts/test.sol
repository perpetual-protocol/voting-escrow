// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

contract Test {
    uint256 value;

    constructor() {
        value = 123;
    }

    function test() external view returns (uint256) {
        return value;
    }
}
