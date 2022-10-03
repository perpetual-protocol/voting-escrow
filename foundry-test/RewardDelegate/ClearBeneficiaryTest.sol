pragma solidity 0.7.6;

import "forge-std/Test.sol";
import { RewardDelegate } from "../../contracts/RewardDelegate.sol";
import { TestTruster } from "../../contracts/test/TestTruster.sol";

contract ClearBeneficiaryTest is Test {
    RewardDelegate public rewardDelegate;
    TestTruster public trusterContract;
    TestTruster public trusterContract2;
    address public trusterEOA;
    address public beneficiary;

    event BeneficiaryCleared(address indexed truster, address indexed beneficiary);

    function setUp() public {
        rewardDelegate = new RewardDelegate();
        trusterContract = new TestTruster(address(rewardDelegate));
        trusterContract2 = new TestTruster(address(rewardDelegate));
        trusterEOA = address(0x1);
        beneficiary = address(0x10);
    }

    function testClearBeneficiary() public {
        console.logString("clear beneficiary");

        trusterContract.setBeneficiaryCandidate(beneficiary);

        vm.prank(beneficiary);
        rewardDelegate.updateBeneficiary(address(trusterContract));

        vm.expectEmit(true, true, false, false);
        emit BeneficiaryCleared(address(trusterContract), beneficiary);
        trusterContract.clearBeneficiary(beneficiary);

        address beneficiaryAddress;
        uint256 qualifiedMultiplier;

        (beneficiaryAddress, qualifiedMultiplier) = rewardDelegate.getBeneficiaryAndQualifiedMultiplier(
            address(trusterContract)
        );
        assertEq(beneficiaryAddress, address(trusterContract));
        assertEq(qualifiedMultiplier, 1);

        (beneficiaryAddress, qualifiedMultiplier) = rewardDelegate.getBeneficiaryAndQualifiedMultiplier(beneficiary);
        assertEq(beneficiaryAddress, beneficiary);
        assertEq(qualifiedMultiplier, 1);
    }

    function testTwoDelegationsThenClearOne() public {
        console.logString("two delegations then clear one");

        trusterContract.setBeneficiaryCandidate(beneficiary);
        trusterContract2.setBeneficiaryCandidate(beneficiary);

        vm.prank(beneficiary);
        rewardDelegate.updateBeneficiary(address(trusterContract));

        vm.prank(beneficiary);
        rewardDelegate.updateBeneficiary(address(trusterContract2));

        trusterContract.clearBeneficiary(beneficiary);

        address beneficiaryAddress;
        uint256 qualifiedMultiplier;

        (beneficiaryAddress, qualifiedMultiplier) = rewardDelegate.getBeneficiaryAndQualifiedMultiplier(
            address(trusterContract)
        );
        assertEq(beneficiaryAddress, address(trusterContract));
        assertEq(qualifiedMultiplier, 1);

        (beneficiaryAddress, qualifiedMultiplier) = rewardDelegate.getBeneficiaryAndQualifiedMultiplier(
            address(trusterContract2)
        );
        assertEq(beneficiaryAddress, beneficiary);
        assertEq(qualifiedMultiplier, 2);

        (beneficiaryAddress, qualifiedMultiplier) = rewardDelegate.getBeneficiaryAndQualifiedMultiplier(beneficiary);
        assertEq(beneficiaryAddress, beneficiary);
        assertEq(qualifiedMultiplier, 2);
    }

    function testErrorNoDelegation() public {
        console.logString("force error, no delegation");

        vm.expectRevert(bytes("RD_BNS"));
        trusterContract.clearBeneficiary(beneficiary);
    }

    function testErrorBeneficiaryNotSet() public {
        console.logString("force error, incomplete delegation (without updateBeneficiary)");

        trusterContract.setBeneficiaryCandidate(beneficiary);

        vm.expectRevert(bytes("RD_BNS"));
        trusterContract.clearBeneficiary(beneficiary);
    }
}
