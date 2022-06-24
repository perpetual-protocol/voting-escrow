// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change ThresholdContractStorageV1. Create a new
/// contract which implements ThresholdContractStorageV1 and following the naming convention
/// ThresholdContractStorageVX.
abstract contract ThresholdContractStorageV1 {
    address internal _insuranceFund;

    address internal _feeDistributor;

    address internal _dao;

    uint24 internal _daoPercentage;
}
