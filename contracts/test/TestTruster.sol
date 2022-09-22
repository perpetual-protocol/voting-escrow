// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { IRewardDelegate } from "../interface/IRewardDelegate.sol";

contract TestTruster {
    address public rewardDelegate;

    constructor(address rewardDelegateArg) {
        rewardDelegate = rewardDelegateArg;
    }

    function setBeneficiaryCandidate(address candidate) external {
        IRewardDelegate(rewardDelegate).setBeneficiaryCandidate(candidate);
    }
}
