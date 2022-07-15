// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change SurplusBeneficiaryStorageV1. Create a new
/// contract which implements SurplusBeneficiaryStorageV1 and following the naming convention
/// SurplusBeneficiaryStorageVX.

abstract contract SurplusBeneficiaryStorageV1 {
    address internal _token;

    address internal _feeDistributor;

    address internal _treasury;

    /// @dev The ratio is in `1e6` format, that means `1% = 1e4`
    uint24 internal _treasuryPercentage;
}
