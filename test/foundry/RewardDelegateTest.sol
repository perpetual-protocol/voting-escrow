pragma solidity 0.7.6;

import "forge-std/Test.sol";
import { RewardDelegate } from "../../contracts/RewardDelegate.sol";

contract RewardDelegateTest is Test {
    RewardDelegate public rewardDelegate;
    address public trusterA;
    address public trusterB;
    address public beneficiary;

    function setUp() public {
        rewardDelegate = new RewardDelegate();
        trusterA = address(0x1);
        trusterB = address(0x2);
        beneficiary = address(0x3);
    }

    function testSetBeneficiaryCandidate() public {
        vm.prank(trusterA);
        rewardDelegate.setBeneficiaryCandidate(beneficiary);

        address candidate = rewardDelegate.getBeneficiaryCandidate(trusterA);
        assertEq(candidate, beneficiary);
    }
}
