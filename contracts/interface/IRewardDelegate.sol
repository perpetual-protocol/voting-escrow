// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface IRewardDelegate {
    event BeneficiarySet(address indexed truster, address indexed beneficiary);

    event BeneficiaryCleared(address indexed truster, address indexed beneficiary);

    function setBeneficiaryCandidate(address candidate) external;

    function updateBeneficiary(address truster) external;

    function clearBeneficiary(address beneficiary) external;

    function getBeneficiaryCandidate(address truster) external view returns (address);

    function getBeneficiaryAndTrusterCount(address truster) external view returns (address, uint256);
}
