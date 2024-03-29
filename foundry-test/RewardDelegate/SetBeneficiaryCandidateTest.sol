pragma solidity 0.7.6;

import "forge-std/Test.sol";
import { RewardDelegate } from "../../contracts/RewardDelegate.sol";
import { TestTruster } from "../../contracts/test/TestTruster.sol";

contract SetBeneficiaryCandidateTest is Test {
    RewardDelegate public rewardDelegate;
    TestTruster public trusterContract;
    TestTruster public trusterContract2;
    address public trusterEOA;
    address public beneficiary;

    event BeneficiarySet(address indexed truster, address indexed beneficiary);

    function setUp() public {
        rewardDelegate = new RewardDelegate();
        trusterContract = new TestTruster(address(rewardDelegate));
        trusterContract2 = new TestTruster(address(rewardDelegate));
        trusterEOA = address(0x1);
        beneficiary = address(0x10);
    }

    function testContractSetBeneficiaryCandidate() public {
        console.logString("contract sets beneficiary candidate to beneficiary");

        trusterContract.setBeneficiaryCandidate(beneficiary);

        address candidate = rewardDelegate.getBeneficiaryCandidate(address(trusterContract));
        assertEq(candidate, beneficiary);
    }

    function testErrorEOASetBeneficiaryCandidate() public {
        console.logString("force error, EOA sets beneficiary candidate to beneficiary");

        vm.prank(trusterEOA);
        vm.expectRevert(bytes("RD_TNC"));
        rewardDelegate.setBeneficiaryCandidate(beneficiary);

        address candidate = rewardDelegate.getBeneficiaryCandidate(trusterEOA);
        assertEq(candidate, address(0));
    }

    function testFuzzGetBeneficiaryCandidate(address truster) public {
        console.logString("fuzz truster address to get beneficiary candidate");

        address candidate = rewardDelegate.getBeneficiaryCandidate(truster);
        assertEq(candidate, address(0));
    }

    function testErrorSetBeneficiaryCandidateToSelf() public {
        console.logString("force error, sets beneficiary candidate to self");

        vm.expectRevert(bytes("RD_CE"));
        trusterContract.setBeneficiaryCandidate(address(trusterContract));
    }

    function testErrorSetBeneficiaryCandidateToContract() public {
        console.logString("force error, sets beneficiary candidate to contract");

        vm.expectRevert(bytes("RD_CE"));
        trusterContract.setBeneficiaryCandidate(address(trusterContract2));
    }

    function testErrorSetBeneficiaryCandidateToZeroAddress() public {
        console.logString("force error, sets beneficiary candidate to zero address");

        vm.expectRevert(bytes("RD_CE"));
        trusterContract.setBeneficiaryCandidate(address(0));
    }

    function testNoDelegation() public {
        console.logString("contract doesn't delegate");

        (address beneficiaryAddress, uint256 qualifiedMultiplier) =
            rewardDelegate.getBeneficiaryAndQualifiedMultiplier(address(trusterContract));
        assertEq(beneficiaryAddress, address(trusterContract));
        assertEq(qualifiedMultiplier, 1);
    }

    function testSingleDelegation() public {
        console.logString("single contract delegates to one EOA (2-step delegation)");

        // only one contract sets beneficiary candidate to beneficiary
        trusterContract.setBeneficiaryCandidate(beneficiary);

        vm.prank(beneficiary);
        vm.expectEmit(true, true, false, false);
        emit BeneficiarySet(address(trusterContract), beneficiary);
        rewardDelegate.updateBeneficiary(address(trusterContract));

        (address beneficiaryAddress, uint256 qualifiedMultiplier) =
            rewardDelegate.getBeneficiaryAndQualifiedMultiplier(address(trusterContract));
        assertEq(beneficiaryAddress, beneficiary);
        assertEq(qualifiedMultiplier, 2);
    }

    function testMultipleDelegation() public {
        console.logString("multiple contracts delegate to the same EOA (2-step delegation)");

        // multiple contracts set beneficiary candidate to beneficiary
        trusterContract.setBeneficiaryCandidate(beneficiary);
        trusterContract2.setBeneficiaryCandidate(beneficiary);

        vm.prank(beneficiary);
        vm.expectEmit(true, true, false, false);
        emit BeneficiarySet(address(trusterContract), beneficiary);
        rewardDelegate.updateBeneficiary(address(trusterContract));

        vm.prank(beneficiary);
        vm.expectEmit(true, true, false, false);
        emit BeneficiarySet(address(trusterContract2), beneficiary);
        rewardDelegate.updateBeneficiary(address(trusterContract2));

        address beneficiaryAddress;
        uint256 qualifiedMultiplier;

        (beneficiaryAddress, qualifiedMultiplier) = rewardDelegate.getBeneficiaryAndQualifiedMultiplier(
            address(trusterContract)
        );
        assertEq(beneficiaryAddress, beneficiary);
        assertEq(qualifiedMultiplier, 3);

        (beneficiaryAddress, qualifiedMultiplier) = rewardDelegate.getBeneficiaryAndQualifiedMultiplier(
            address(trusterContract2)
        );
        assertEq(beneficiaryAddress, beneficiary);
        assertEq(qualifiedMultiplier, 3);
    }

    function testErrorUpdateBeneficiaryWithoutCandidate() public {
        console.logString("force error, update beneficiary without candidate");

        vm.prank(beneficiary);
        vm.expectRevert(bytes("RD_CNS"));
        rewardDelegate.updateBeneficiary(address(trusterContract));
    }

    function testErrorUpdateBeneficiaryBySelf() public {
        console.logString("force error, update beneficiary by self");

        trusterContract.setBeneficiaryCandidate(beneficiary);

        vm.prank(address(trusterContract));
        vm.expectRevert(bytes("RD_CNS"));
        rewardDelegate.updateBeneficiary(beneficiary);
    }

    function testErrorRepeatedUpdateToSameBeneficiary() public {
        console.logString("force error, update beneficiary to same address repeatedly");

        trusterContract.setBeneficiaryCandidate(beneficiary);

        vm.prank(beneficiary);
        rewardDelegate.updateBeneficiary(address(trusterContract));

        vm.expectRevert(bytes("RD_RUB"));

        vm.prank(beneficiary);
        rewardDelegate.updateBeneficiary(address(trusterContract));
    }
}
