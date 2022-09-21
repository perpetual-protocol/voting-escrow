// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IRewardDelegate } from "./interface/IRewardDelegate.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";

contract RewardDelegate is IRewardDelegate {
    using Address for address;
    using SafeMath for uint256;

    mapping(address => address) private _beneficiaryCandidate;
    mapping(address => address) private _beneficiary;
    mapping(address => uint256) private _trusterCount; // the count of how many trusters delegated to

    //
    // EXTERNAL NON-VIEW
    //

    function setBeneficiaryCandidate(address candidate) external override {
        address truster = msg.sender;

        // RD_CE: candidate error
        require(candidate != truster && !candidate.isContract(), "RD_CE");

        _beneficiaryCandidate[truster] = candidate;
    }

    function updateBeneficiary(address truster) external override {
        address beneficiary = msg.sender;

        // RD_CNS: candidate not set
        require(_beneficiaryCandidate[truster] == beneficiary, "RD_CNS");

        _beneficiary[truster] = beneficiary;
        _trusterCount[beneficiary] = _trusterCount[beneficiary].add(1);

        emit BeneficiarySet(truster, beneficiary);
    }

    function clearBeneficiary(address beneficiary) external override {
        address truster = msg.sender;

        // RD_BNS: beneficiary not set
        require(_beneficiary[truster] == beneficiary, "RD_BNS");

        _beneficiaryCandidate[truster] = address(0);
        _beneficiary[truster] = address(0);

        _trusterCount[beneficiary] = _trusterCount[beneficiary].sub(1);

        emit BeneficiaryCleared(truster, beneficiary);
    }

    //
    // EXTERNAL VIEW
    //

    function getBeneficiaryAndTrusterCount(address truster) external view override returns (address, uint256) {
        address beneficiary = _beneficiary[truster] != address(0) ? _beneficiary[truster] : truster;

        if (beneficiary == address(0)) {
            return (truster, 1);
        }

        return (beneficiary, _trusterCount[beneficiary]);
    }

    function getBeneficiaryCandidate(address truster) external view override returns (address) {
        return _beneficiaryCandidate[truster];
    }

    function getBeneficiary(address truster) external view override returns (address) {
        return _beneficiary[truster];
    }

    function getTrusterCount(address beneficiary) external view override returns (uint256) {
        return _trusterCount[beneficiary];
    }
}
