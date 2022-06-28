// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { MerkleRedeemUpgradeSafe } from "./Balancer/MerkleRedeemUpgradeSafe.sol";
import { IvePERP } from "./interface/IvePERP.sol";

contract vePERPRewardDistributor is MerkleRedeemUpgradeSafe {
    using AddressUpgradeable for address;

    /// @notice Emitted when vePERP address is changed.
    /// @param oldValue Old vePERP address
    /// @param newValue New vePERP address
    event VePERPChanged(address oldValue, address newValue);

    /// @notice Emitted when minimum lock duration is changed.
    /// @param oldValue Old minimum lock time
    /// @param newValue New minimum lock time
    event MinLockDurationChanged(uint256 oldValue, uint256 newValue);

    /// @notice Emitted when seed allocation on a week
    /// @param week Week number
    /// @param totalAllocation Total allocation on the week
    event AllocationSeeded(uint256 indexed week, uint256 totalAllocation);

    /// @notice Emitted when user claim vePERP reward
    /// @param claimant Claimant address
    /// @param week Week number
    /// @param balance Amount of vePERP reward claimed
    event VePERPClaimed(address indexed claimant, uint256 indexed week, uint256 balance);

    uint256 internal constant _WEEK = 7 * 86400; // a week in seconds

    //**********************************************************//
    //    The below state variables can not change the order    //
    //**********************************************************//
    // array of week
    uint256[] internal _merkleRootIndexes;
    uint256 internal _minLockDuration;
    address internal _vePERP;
    //**********************************************************//
    //    The above state variables can not change the order    //
    //**********************************************************//

    //
    // MODIFIER
    //

    /// @notice Modifier to check if the caller's vePERP lock time is over minLockDuration
    modifier userLockTimeCheck(address user) {
        uint256 currentEpochStartTimestamp = (block.timestamp / _WEEK) * _WEEK; // round down to the start of the epoch
        uint256 userLockEndTimestamp = IvePERP(_vePERP).locked__end(user);

        // vePRD_LTM: vePERP lock time is less than minLockDuration
        require(userLockEndTimestamp >= currentEpochStartTimestamp + _minLockDuration, "vePRD_LTM");
        _;
    }

    //
    // ONLY OWNER
    //

    function initialize(
        address tokenArg,
        address vePERPArg,
        uint256 minLockDurationArg
    ) external initializer {
        // vePRD_TNC: token is not a contract
        require(tokenArg.isContract(), "vePRD_TNC");

        __MerkleRedeem_init(tokenArg);

        setVePERP(vePERPArg);
        setMinLockDuration(minLockDurationArg);

        // approve the vePERP contract to spend the PERP token
        token.approve(vePERPArg, uint256(-1));
    }

    function seedAllocations(
        uint256 week,
        bytes32 merkleRoot,
        uint256 totalAllocation
    ) public override onlyOwner {
        // vePRD_TIZ: total allocation is zero
        require(totalAllocation > 0, "vePRD_TIZ");
        super.seedAllocations(week, merkleRoot, totalAllocation);
        _merkleRootIndexes.push(week);
        emit AllocationSeeded(week, totalAllocation);
    }

    /// @dev In case of vePERP migration, unclaimed PERP would be able to be deposited to the new contract instead
    function setVePERP(address vePERPArg) public onlyOwner {
        // vePRD_vePNC: vePERP is not a contract
        require(vePERPArg.isContract(), "vePRD_vePNC");
        emit VePERPChanged(_vePERP, vePERPArg);
        _vePERP = vePERPArg;
    }

    function setMinLockDuration(uint256 minLockDurationArg) public onlyOwner {
        emit MinLockDurationChanged(_minLockDuration, minLockDurationArg);
        _minLockDuration = minLockDurationArg;
    }

    //
    // PUBLIC NON-VIEW
    //

    /// @notice Claim vePERP reward for a week
    /// @dev Overwrite the parent's function because vePERP distributor doesn't follow the inherited behaviors
    ///      from its parent. More specifically, it uses deposit_for() instead of transfer() to distribute the rewards.
    /// @param liquidityProvider Liquidity provider address
    /// @param week Week number of the reward claimed
    /// @param claimedBalance Amount of vePERP reward claimed
    /// @param merkleProof Merkle proof of the week's allocation
    function claimWeek(
        address liquidityProvider,
        uint256 week,
        uint256 claimedBalance,
        bytes32[] calldata merkleProof
    ) public override userLockTimeCheck(liquidityProvider) {
        // vePRD_CA: claimed already
        require(!claimed[week][liquidityProvider], "vePRD_CA");

        // vePRD_IMP: invalid merkle proof
        require(verifyClaim(liquidityProvider, week, claimedBalance, merkleProof), "vePRD_IMP");

        claimed[week][liquidityProvider] = true;
        _distribute(liquidityProvider, claimedBalance);
        emit VePERPClaimed(liquidityProvider, week, claimedBalance);
    }

    /// @notice Claim vePERP reward for multiple weeks
    /// @dev Overwrite the parent's function because vePERP distributor doesn't follow the inherited behaviors
    ///      from its parent. More specifically, it uses deposit_for() instead of transfer() to distribute the rewards.
    /// @param liquidityProvider Liquidity provider address
    /// @param claims Array of Claim structs
    function claimWeeks(address liquidityProvider, Claim[] calldata claims)
        public
        override
        userLockTimeCheck(liquidityProvider)
    {
        uint256 totalBalance = 0;
        uint256 length = claims.length;
        Claim calldata claim;

        for (uint256 i = 0; i < length; i++) {
            claim = claims[i];

            // vePRD_CA: claimed already
            require(!claimed[claim.week][liquidityProvider], "vePRD_CA");

            // vePRD_IMP: invalid merkle proof
            require(verifyClaim(liquidityProvider, claim.week, claim.balance, claim.merkleProof), "vePRD_IMP");

            totalBalance += claim.balance;
            claimed[claim.week][liquidityProvider] = true;
            emit VePERPClaimed(liquidityProvider, claim.week, claim.balance);
        }
        _distribute(liquidityProvider, totalBalance);
    }

    //
    // EXTERNAL VIEW
    //

    /// @notice Get the merkleRootIndexes length
    /// @return length The length of merkleRootIndexes
    function getLengthOfMerkleRoots() external view returns (uint256 length) {
        return _merkleRootIndexes.length;
    }

    /// @notice Get the merkleRootIndexes
    /// @param index The index of merkleRootIndexes
    /// @return week The week number of the given index
    function getMerkleRootsIndex(uint256 index) external view returns (uint256 week) {
        return _merkleRootIndexes[index];
    }

    /// @notice Get `vePERP` address
    /// @return vePERP The address of vePERP
    function getVePerp() external view returns (address vePERP) {
        return _vePERP;
    }

    /// @notice Get minLockDuration
    /// @return minLockDuration The minimum lock duration time
    function getMinLockDuration() external view returns (uint256 minLockDuration) {
        return _minLockDuration;
    }

    //
    // INTERNAL NON-VIEW
    //

    /// @dev Replace parent function disburse() because vePERP distributor uses deposit_for() instead of transfer()
    ///      to distribute the rewards
    function _distribute(address liquidityProvider, uint256 balance) internal {
        if (balance > 0) {
            emit Claimed(liquidityProvider, balance);
            IvePERP(_vePERP).deposit_for(liquidityProvider, balance);
        }
    }
}
