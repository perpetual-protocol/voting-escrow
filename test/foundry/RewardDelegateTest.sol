pragma solidity 0.7.6;

import "forge-std/Test.sol";
import { RewardDelegate } from "../contracts/RewardDelegate.sol";
import { TestTruster } from "../contracts/test/TestTruster.sol";

contract RewardDelegateTest is Test {
    RewardDelegate public rewardDelegate;
    TestTruster public trusterContract;
    address public trusterEOA;
    address public beneficiary;

    function setUp() public {
        rewardDelegate = new RewardDelegate();
        trusterContract = new TestTruster(address(rewardDelegate));
        trusterEOA = address(0x1);
        beneficiary = address(0x10);
    }

    function testContractSetBeneficiaryCandidate() public {
        trusterContract.setBeneficiaryCandidate(beneficiary);

        address candidate = rewardDelegate.getBeneficiaryCandidate(address(trusterContract));
        assertEq(candidate, beneficiary);
    }

    function testEOASetBeneficiaryCandidate() public {
        vm.prank(trusterEOA);
        rewardDelegate.setBeneficiaryCandidate(beneficiary);

        address candidate = rewardDelegate.getBeneficiaryCandidate(trusterEOA);
        assertEq(candidate, beneficiary);
    }
}
