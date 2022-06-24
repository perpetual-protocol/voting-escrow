// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface IThresholdContract {
    /// @notice Emitted when feeDistribute function is trigger
    /// @param feeToDao Distributed fee amount
    /// @param feeToFeeDistributor Distributed fee amount
    event FeeDistribute(uint256 feeToDao, uint256 feeToFeeDistributor);

    /// @notice Emitted when insuranceFund address is changed.
    /// @param oldValue Old insuranceFund address
    /// @param newValue New insuranceFund address
    event InsuranceFundChanged(address oldValue, address newValue);

    /// @notice Emitted when feeDistributor address is changed.
    /// @param oldValue Old feeDistributor address
    /// @param newValue New feeDistributor address
    event FeeDistributorChanged(address oldValue, address newValue);

    /// @notice Emitted when Dao address is changed.
    /// @param oldValue Old Dao address
    /// @param newValue New Dao address
    event DaoChanged(address oldValue, address newValue);

    /// @notice Emitted when DaoPercentage value is changed.
    /// @param oldValue Old DaoPercentage value
    /// @param newValue New DaoPercentage value
    event DaoPercentageChanged(uint24 oldValue, uint24 newValue);

    /// @notice Will call `IF.feeDistribute()`, and if balance of `InsuranceFund` is over `threshold`,
    ///         transfer diff to `Threshold` contract
    /// @dev After `InsuranceFund` transfer fee to `ThresholdContract`, will call `FeeDistributor.burn()`
    ///      to distribute fee
    /// @return fee Distributed fee amount
    function feeDistribute() external returns (uint256 fee);

    /// @notice Get Insurance Fund contract address
    /// @return insuranceFund The address of Insurance Fund contract
    function getInsuranceFund() external view returns (address insuranceFund);

    /// @notice Get Fee Distributor contract address
    /// @return feeDistributor The address of Fee Distributor contract
    function getFeeDistributor() external view returns (address feeDistributor);

    /// @notice Get DAO multisig address
    /// @return dao The address of DAO multisig
    function getDao() external view returns (address dao);

    /// @notice Get DAO's fee share
    /// @return percentage DAO's fee share (6 decimals, 1000000 = 100%)
    function getDaoPercentage() external view returns (uint24 percentage);
}
