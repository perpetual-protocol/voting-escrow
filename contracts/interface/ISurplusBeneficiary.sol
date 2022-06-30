// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface ISurplusBeneficiary {
    /// @notice Emitted when dispatch function is trigger
    /// @param amountToDao Distributed fee amount
    /// @param amountToFeeDistributor Distributed fee amount
    event Dispatch(uint256 amountToDao, uint256 amountToFeeDistributor);

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

    /// @notice Will dispatch all balance to `Treasury` and `FeeDistributor`
    /// @return amount Total dispatched amount
    function dispatch() external returns (uint256 amount);

    /// @notice Get token address
    /// @return token The address of token
    function getToken() external view returns (address token);

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
