// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

interface IvePERP {
    struct Point {
        int128 bias;
        int128 slope;
        uint256 ts;
        uint256 blk;
        uint256 perp_amt;
    }

    function epoch() external view returns (uint256 currentEpoch);

    function point_history(uint256 epoch) external view returns (Point memory);

    function locked__end(address user) external view returns (uint256 userLockEndTimestamp);

    function balanceOfUnweighted(address user, uint256 timestamp) external view returns (uint256 unweightedVotingPower);

    function totalSupplyUnweighted(uint256 timestamp) external view returns (uint256 unweightedTotalVotingPower);

    function deposit_for(address user, uint256 amount) external;

    function approve(address spender, uint256 amount) external returns (bool);
}
