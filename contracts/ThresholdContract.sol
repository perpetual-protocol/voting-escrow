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
import { OwnerPausable } from "@perp/curie-contract/contracts/base/OwnerPausable.sol";
import { IInsuranceFund } from "@perp/curie-contract/contracts/interface/IInsuranceFund.sol";
import { PerpMath } from "@perp/curie-contract/contracts/lib/PerpMath.sol";
import { ThresholdContractStorageV1 } from "./storage/ThresholdContractStorage.sol";
import { IThresholdContract } from "./interface/IThresholdContract.sol";
import { IFeeDistributor } from "./interface/IFeeDistributor.sol";

contract ThresholdContract is
    IThresholdContract,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    ThresholdContractStorageV1
{
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using PerpMath for uint256;

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(
        address insuranceFundArg,
        address feeDistributorArg,
        address daoArg,
        uint24 daoPercentageArg
    ) public initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();

        setInsuranceFund(insuranceFundArg);
        setFeeDistributor(feeDistributorArg);
        setDao(daoArg);
        setDaoPercentage(daoPercentageArg);

        address token = IInsuranceFund(insuranceFundArg).getToken();
        IERC20Upgradeable(token).approve(feeDistributorArg, uint256(-1));
    }

    //
    // PUBLIC ONLY-ADMIN NON-VIEW
    //

    function setInsuranceFund(address insuranceFundArg) public onlyOwner {
        // TC_INC: insuranceFund address is not contract
        require(insuranceFundArg.isContract(), "TC_INC");
        emit InsuranceFundChanged(_insuranceFund, insuranceFundArg);
        _insuranceFund = insuranceFundArg;
    }

    function setFeeDistributor(address feeDistributorArg) public onlyOwner {
        // TC_FDNC: feeDistributor address is not contract
        require(feeDistributorArg.isContract(), "TC_FDNC");
        emit FeeDistributorChanged(_feeDistributor, feeDistributorArg);
        _feeDistributor = feeDistributorArg;
    }

    function setDao(address daoArg) public onlyOwner {
        // TC_DNC: dao address is not contract
        require(daoArg.isContract(), "TC_DNC");
        emit DaoChanged(_dao, daoArg);
        _dao = daoArg;
    }

    function setDaoPercentage(uint24 daoPercentageArg) public onlyOwner {
        // TC_DPZ: dao percentage is equal to zero
        require(daoPercentageArg > 0, "TC_DPZ");
        emit DaoPercentageChanged(_daoPercentage, daoPercentageArg);
        _daoPercentage = daoPercentageArg;
    }

    //
    // EXTERNAL NON-VIEW
    //

    function feeDistribute() external override returns (uint256) {
        address insuranceFund = _insuranceFund;

        address token = IInsuranceFund(insuranceFund).getToken();
        uint256 fee = IInsuranceFund(insuranceFund).distributeFee();

        // TC_FZ: fee is zero
        require(fee > 0, "TC_FZ");

        uint256 feeToDao = fee.mulRatio(_daoPercentage);

        // transfer to dao first, because FeeDistributor.burn() will transfer all balance from ThresholdContract
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), _dao, feeToDao);
        IFeeDistributor(_feeDistributor).burn(token);

        uint256 balance = IERC20Upgradeable(token).balanceOf(address(this));
        // TC_BZ: balance is not zero
        require(balance == 0, "TC_BNZ");

        // TODO: need to discuss which amount we want to emit, fee or balanceDelta
        emit FeeDistribute(feeToDao, fee.sub(feeToDao));

        return fee;
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IThresholdContract
    function getInsuranceFund() external view override returns (address) {
        return _insuranceFund;
    }

    /// @inheritdoc IThresholdContract
    function getFeeDistributor() external view override returns (address) {
        return _feeDistributor;
    }

    /// @inheritdoc IThresholdContract
    function getDao() external view override returns (address) {
        return _dao;
    }

    /// @inheritdoc IThresholdContract
    function getDaoPercentage() external view override returns (uint24) {
        return _daoPercentage;
    }
}
