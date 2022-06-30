// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {
    SafeERC20Upgradeable,
    IERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { SurplusBeneficiaryStorageV1 } from "./storage/SurplusBeneficiaryStorage.sol";
import { ISurplusBeneficiary } from "./interface/ISurplusBeneficiary.sol";
import { IFeeDistributor } from "./interface/IFeeDistributor.sol";

contract SurplusBeneficiary is
    ISurplusBeneficiary,
    ReentrancyGuardUpgradeable,
    OwnableUpgradeable,
    SurplusBeneficiaryStorageV1
{
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(
        address tokenArg,
        address feeDistributorArg,
        address treasuryArg,
        uint24 treasuryPercentageArg
    ) public initializer {
        __ReentrancyGuard_init();
        __Ownable_init();

        setToken(tokenArg);
        setFeeDistributor(feeDistributorArg);
        setTreasury(treasuryArg);
        setTreasuryPercentage(treasuryPercentageArg);

        IERC20Upgradeable(_token).approve(feeDistributorArg, uint256(-1));
    }

    //
    // PUBLIC ONLY-ADMIN NON-VIEW
    //

    function setToken(address tokenArg) public onlyOwner {
        // SB_TANC: token address is not contract
        require(tokenArg.isContract(), "SB_TANC");
        emit TokenChanged(_token, tokenArg);
        _token = tokenArg;
    }

    function setFeeDistributor(address feeDistributorArg) public onlyOwner {
        // SB_FDNC: feeDistributor address is not contract
        require(feeDistributorArg.isContract(), "SB_FDNC");
        emit FeeDistributorChanged(_feeDistributor, feeDistributorArg);
        _feeDistributor = feeDistributorArg;
    }

    function setTreasury(address treasuryArg) public onlyOwner {
        // SB_TNC: treasury address is not contract
        require(treasuryArg.isContract(), "SB_TNC");
        emit TreasuryChanged(_treasury, treasuryArg);
        _treasury = treasuryArg;
    }

    function setTreasuryPercentage(uint24 treasuryPercentageArg) public onlyOwner {
        // SB_TPZ: treasury percentage is equal to zero
        require(treasuryPercentageArg > 0, "SB_TPZ");
        emit TreasuryPercentageChanged(_treasuryPercentage, treasuryPercentageArg);
        _treasuryPercentage = treasuryPercentageArg;
    }

    //
    // EXTERNAL NON-VIEW
    //

    /// @inheritdoc ISurplusBeneficiary
    function dispatch() external override nonReentrant returns (uint256) {
        address token = _token;

        uint256 tokenAmount = IERC20Upgradeable(token).balanceOf(address(this));

        // SB_TAZ: token amount is zero
        require(tokenAmount > 0, "SB_TAZ");

        uint256 tokenAmountToTreasury = FullMath.mulDiv(tokenAmount, _treasuryPercentage, 1e6);

        // transfer to treasury first, because FeeDistributor.burn() will transfer all balance from SurplusBeneficiary
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), _treasury, tokenAmountToTreasury);
        IFeeDistributor(_feeDistributor).burn(token);

        uint256 balanceAfter = IERC20Upgradeable(token).balanceOf(address(this));

        // SB_BNZ: balance is not zero
        require(balanceAfter == 0, "SB_BNZ");

        emit Dispatch(tokenAmountToTreasury, tokenAmount.sub(tokenAmountToTreasury));

        return tokenAmount;
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc ISurplusBeneficiary
    function getToken() external view override returns (address) {
        return _token;
    }

    /// @inheritdoc ISurplusBeneficiary
    function getFeeDistributor() external view override returns (address) {
        return _feeDistributor;
    }

    /// @inheritdoc ISurplusBeneficiary
    function getTreasury() external view override returns (address) {
        return _treasury;
    }

    /// @inheritdoc ISurplusBeneficiary
    function getTreasuryPercentage() external view override returns (uint24) {
        return _treasuryPercentage;
    }
}
