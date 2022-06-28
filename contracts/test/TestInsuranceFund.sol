// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

contract TestInsuranceFund {
    address internal _token;

    constructor(address tokenArg) {
        _token = tokenArg;
    }

    function getToken() external view returns (address) {
        return _token;
    }

    function distributeFee() external returns (uint256) {
        address token = _token;

        uint256 balance = IERC20(token).balanceOf(address(this));
        SafeERC20.safeTransfer(IERC20(token), msg.sender, balance);

        return balance;
    }
}
