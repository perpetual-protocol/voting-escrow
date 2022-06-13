// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { vePERPRewardDistributor } from "../vePERPRewardDistributor.sol";

contract testVePERPRewardDistributor is vePERPRewardDistributor {
    function verifyClaim(
        address _liquidityProvider,
        uint256 _week,
        uint256 _claimedBalance,
        bytes32[] memory _merkleProof
    ) public view override returns (bool valid) {
        return true;
    }
}
