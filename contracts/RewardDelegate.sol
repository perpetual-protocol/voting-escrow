// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { IRewardDelegate } from "./interface/IRewardDelegate.sol";

contract RewardDelegate is IRewardDelegate {
    using Address for address;
    using SafeMath for uint256;

    // truster => beneficiaryCandidate
    mapping(address => address) internal _beneficiaryCandidateMap;
    // truster => beneficiary
    mapping(address => address) internal _beneficiaryMap;
    // beneficiary => how many trusters explicitly delegate to this beneficiary,
    // excluding beneficiary self
    // explicitly means calling setBeneficiaryCandidate() and updateBeneficiary()
    mapping(address => uint256) internal _trusterCountMap;

    //
    // EXTERNAL NON-VIEW
    //

    function setBeneficiaryCandidate(address candidate) external override {
        address truster = msg.sender;

        // RD_TNC: truster is not a contract
        require(truster.isContract(), "RD_TNC");

        // RD_CE: candidate error
        require(candidate != truster && !candidate.isContract() && candidate != address(0), "RD_CE");

        _beneficiaryCandidateMap[truster] = candidate;
    }

    function updateBeneficiary(address truster) external override {
        address beneficiary = msg.sender;

        // RD_CNS: candidate not set
        require(_beneficiaryCandidateMap[truster] == beneficiary, "RD_CNS");

        _beneficiaryMap[truster] = beneficiary;
        _trusterCountMap[beneficiary] = _trusterCountMap[beneficiary].add(1);

        emit BeneficiarySet(truster, beneficiary);
    }

    function clearBeneficiary(address beneficiary) external override {
        address truster = msg.sender;

        // RD_BNS: beneficiary not set
        require(_beneficiaryMap[truster] == beneficiary, "RD_BNS");

        _beneficiaryCandidateMap[truster] = address(0);
        _beneficiaryMap[truster] = address(0);

        _trusterCountMap[beneficiary] = _trusterCountMap[beneficiary].sub(1);

        emit BeneficiaryCleared(truster, beneficiary);
    }

    //
    // EXTERNAL VIEW
    //

    function getBeneficiaryCandidate(address truster) external view override returns (address) {
        return _beneficiaryCandidateMap[truster];
    }

    function getBeneficiaryAndQualifiedMultiplier(address truster) external view override returns (address, uint256) {
        // if A delegates to B,
        //     getBeneficiaryAndQualifiedMultiplier(A) => B, 2
        //     getBeneficiaryAndQualifiedMultiplier(B) => B, 2
        // if A didn't delegate to anyone,
        //     getBeneficiaryAndQualifiedMultiplier(A) => A, 1
        // if A delegates to B, and C delegates to B,
        //     getBeneficiaryAndQualifiedMultiplier(A) => B, 3
        //     getBeneficiaryAndQualifiedMultiplier(B) => B, 3
        //     getBeneficiaryAndQualifiedMultiplier(C) => B, 3
        address beneficiary = _beneficiaryMap[truster];

        if (beneficiary == address(0)) {
            return (truster, _trusterCountMap[truster].add(1));
        }

        return (beneficiary, _trusterCountMap[beneficiary].add(1));
    }
}
