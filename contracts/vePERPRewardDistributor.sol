// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { MerkleRedeemUpgradeSafe } from "./Balancer/MerkleRedeemUpgradeSafe.sol";
import { IvePERP } from "./interface/IvePERP.sol";

contract vePERPRewardDistributor is MerkleRedeemUpgradeSafe {
    //**********************************************************//
    //    The below state variables can not change the order    //
    //**********************************************************//
    // array of week
    uint256[] public merkleRootIndexes;
    uint256 public minLockTime;
    address public vePERP;
    //**********************************************************//
    //    The above state variables can not change the order    //
    //**********************************************************//

    //
    // MODIFIER
    //
    modifier userLockTimeCheck(address user) {
        uint256 currentEpoch = IvePERP(vePERP).epoch();
        IvePERP.Point memory point = IvePERP(vePERP).point_history(currentEpoch);
        uint256 currentEpochTimestamp = point.ts;
        uint256 userLockEndTimestamp = IvePERP(vePERP).locked__end(user);

        require(userLockEndTimestamp >= currentEpochTimestamp + minLockTime, "less than minLockTime");
        _;
    }

    //
    // ONLY OWNER
    //

    function initialize(
        address _token,
        address _vePERP,
        uint256 _minLockTime
    ) external initializer {
        require(_token != address(0), "Invalid input");
        minLockTime = _minLockTime;
        vePERP = _vePERP;
        __MerkleRedeem_init(_token);
    }

    function seedAllocations(
        uint256 _week,
        bytes32 _merkleRoot,
        uint256 _totalAllocation
    ) public override onlyOwner {
        super.seedAllocations(_week, _merkleRoot, _totalAllocation);

        // approve the vePERP contract to spend the PERP token
        token.approve(vePERP, _totalAllocation);
        merkleRootIndexes.push(_week);
    }

    //
    // PUBLIC NON-VIEW
    //

    function claimWeek(
        address _liquidityProvider,
        uint256 _week,
        uint256 _claimedBalance,
        bytes32[] calldata _merkleProof
    ) public override userLockTimeCheck(_liquidityProvider) {
        require(!claimed[_week][_liquidityProvider], "Claimed already");
        require(verifyClaim(_liquidityProvider, _week, _claimedBalance, _merkleProof), "Incorrect merkle proof");

        claimed[_week][_liquidityProvider] = true;
        distribute(_liquidityProvider, _claimedBalance);
    }

    function claimWeeks(address _liquidityProvider, Claim[] calldata claims)
        public
        override
        userLockTimeCheck(_liquidityProvider)
    {
        uint256 totalBalance = 0;
        Claim calldata claim;
        for (uint256 i = 0; i < claims.length; i++) {
            claim = claims[i];

            require(!claimed[claim.week][_liquidityProvider], "Claimed already");
            require(
                verifyClaim(_liquidityProvider, claim.week, claim.balance, claim.merkleProof),
                "Incorrect merkle proof"
            );

            totalBalance += claim.balance;
            claimed[claim.week][_liquidityProvider] = true;
        }
        distribute(_liquidityProvider, totalBalance);
    }

    //
    // EXTERNAL VIEW
    //

    function getLengthOfMerkleRoots() external view returns (uint256) {
        return merkleRootIndexes.length;
    }

    //
    // INTERNAL NON-VIEW
    //

    // use distribute instead of origin disburse
    function distribute(address _liquidityProvider, uint256 _balance) internal {
        if (_balance > 0) {
            emit Claimed(_liquidityProvider, _balance);
            IvePERP(vePERP).deposit_for(_liquidityProvider, _balance);
        }
    }
}
