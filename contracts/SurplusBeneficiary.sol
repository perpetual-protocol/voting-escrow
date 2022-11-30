// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { ISurplusBeneficiary } from "./interface/ISurplusBeneficiary.sol";
import { IFeeDistributor } from "./interface/IFeeDistributor.sol";

contract SurplusBeneficiary is ISurplusBeneficiary, ReentrancyGuard, Ownable {
    using Address for address;
    using SafeMath for uint256;

    address internal _token;

    address internal _feeDistributor;

    address internal _treasury;

    /// @dev The ratio is in `1e6` format, that means `1% = 1e4`
    uint24 internal _treasuryPercentage;

    constructor(
        address tokenArg,
        address feeDistributorArg,
        address treasuryArg,
        uint24 treasuryPercentageArg
    ) ReentrancyGuard() Ownable() {
        // SB_TANC: token is not a contract
        require(tokenArg.isContract(), "SB_TANC");
        _token = tokenArg;

        setFeeDistributor(feeDistributorArg);
        setTreasury(treasuryArg);
        setTreasuryPercentage(treasuryPercentageArg);
    }

    //
    // PUBLIC ONLY-ADMIN NON-VIEW
    //

    function setFeeDistributor(address feeDistributorArg) public onlyOwner {
        address token = _token;

        // SB_FDNC: feeDistributor address is not contract
        require(feeDistributorArg.isContract(), "SB_FDNC");

        // SB_TNM: token is not match
        require(IFeeDistributor(feeDistributorArg).token() == token, "SB_TNM");

        address oldFeeDistributor = _feeDistributor;

        // SB_SFD: same fee distributor
        require(feeDistributorArg != oldFeeDistributor, "SB_SFD");
        _feeDistributor = feeDistributorArg;

        emit FeeDistributorChanged(oldFeeDistributor, feeDistributorArg);
    }

    function setTreasury(address treasuryArg) public onlyOwner {
        // SB_TZ: treasury address is zero
        require(treasuryArg != address(0), "SB_TZ");

        address oldTreasury = _treasury;

        // SB_ST: same treasury
        require(treasuryArg != oldTreasury, "SB_ST");
        _treasury = treasuryArg;

        emit TreasuryChanged(oldTreasury, treasuryArg);
    }

    function setTreasuryPercentage(uint24 treasuryPercentageArg) public onlyOwner {
        // SB_TPO: treasury percentage out of bound
        require(treasuryPercentageArg <= 1e6, "SB_TPO");

        uint24 oldTreasuryPercentage = _treasuryPercentage;

        // SB_STP: same treasury percentage
        require(treasuryPercentageArg != oldTreasuryPercentage, "SB_STP");
        _treasuryPercentage = treasuryPercentageArg;

        emit TreasuryPercentageChanged(oldTreasuryPercentage, treasuryPercentageArg);
    }

    //
    // EXTERNAL NON-VIEW
    //

    /// @inheritdoc ISurplusBeneficiary
    function dispatch() external override nonReentrant {
        address token = _token;

        uint256 tokenAmount = IERC20(token).balanceOf(address(this));

        // SB_TAZ: token amount is zero
        require(tokenAmount != 0, "SB_TAZ");

        // note the ratio is in `1e6` format
        uint256 tokenAmountToTreasury = FullMath.mulDiv(tokenAmount, _treasuryPercentage, 1e6);

        // transfer to treasury first, because FeeDistributor.burn() will transfer all balance from SurplusBeneficiary
        // if 0% to treasury, there is no need to transfer fee to treasury
        if (tokenAmountToTreasury > 0) {
            SafeERC20.safeTransfer(IERC20(token), _treasury, tokenAmountToTreasury);
        }

        // if 100% to treasury, there is no need to distribute fee to vePERP holder
        if (tokenAmountToTreasury != tokenAmount) {
            address feeDistributor = _feeDistributor;

            SafeERC20.safeApprove(IERC20(token), feeDistributor, tokenAmount.sub(tokenAmountToTreasury));

            // SB_FDBF: fee distributor burn failed
            require(IFeeDistributor(feeDistributor).burn(token), "SB_FDBF");
        }

        uint256 balanceAfter = IERC20(token).balanceOf(address(this));

        // SB_BNZ: balance is not zero
        require(balanceAfter == 0, "SB_BNZ");

        emit Dispatch(tokenAmountToTreasury, tokenAmount.sub(tokenAmountToTreasury));
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
