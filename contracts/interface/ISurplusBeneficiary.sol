// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface ISurplusBeneficiary {
    /// @notice Emitted when feeDistribute function is trigger
    /// @param feeToDao Distributed fee amount
    /// @param feeToFeeDistributor Distributed fee amount
    event FeeDistribute(uint256 feeToDao, uint256 feeToFeeDistributor);

    /// @notice Emitted when token address is changed.
    /// @param oldValue Old token address
    /// @param newValue New token address
    event TokenChanged(address oldValue, address newValue);

    /// @notice Emitted when feeDistributor address is changed.
    /// @param oldValue Old feeDistributor address
    /// @param newValue New feeDistributor address
    event FeeDistributorChanged(address oldValue, address newValue);

    /// @notice Emitted when `Treasury` multiSig address is changed.
    /// @param oldValue Old Treasury address
    /// @param newValue New Treasury address
    event TreasuryChanged(address oldValue, address newValue);

    /// @notice Emitted when TreasuryPercentage value is changed.
    /// @param oldValue Old TreasuryPercentage value
    /// @param newValue New TreasuryPercentage value
    event TreasuryPercentageChanged(uint24 oldValue, uint24 newValue);

    /// @notice Will transfer all balance to `Treasury` and `FeeDistributor`
    /// @dev Will call `FeeDistributor.burn()` to distribute fee
    /// @return fee Distributed fee amount
    function feeDistribute() external returns (uint256 fee);

    /// @notice Get token address
    /// @return token The address of token
    function getToken() external view returns (address token) ;


    /// @notice Get Fee Distributor contract address
    /// @return feeDistributor The address of Fee Distributor contract
    function getFeeDistributor() external view returns (address feeDistributor);

    /// @notice Get `Treasury` multisig address
    /// @return treasury The address of `Treasury` multisig
    function getTreasury() external view returns (address treasury);

    /// @notice Get Treasury's fee share
    /// @return percentage Treasury's fee share (6 decimals, 1000000 = 100%)
    function getTreasuryPercentage() external view returns (uint24 percentage);
}
