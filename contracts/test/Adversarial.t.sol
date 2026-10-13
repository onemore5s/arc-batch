// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ArcRewardDistributor} from "../src/ArcRewardDistributor.sol";
import {Protocol} from "../src/Protocol.sol";

interface Vm {
    function deal(address, uint256) external;
    function prank(address) external;
}

contract GasBomb {
    receive() external payable {
        assembly { invalid() }
    }
}

contract ForceValue {
    constructor(address payable recipient) payable {
        selfdestruct(recipient);
    }
}

contract ReturnBomb {
    uint256 constant RETURN_SIZE = 65536;

    receive() external payable {
        uint256 size = RETURN_SIZE;
        assembly { return(0, size) }
    }
}

contract AdversarialTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    uint256 constant STEP = Protocol.AMOUNT_STEP;
    uint256 constant GAS_LIMIT = 300000;
    uint256 constant MAXIMUM = 2;
    uint256 constant FUNDING = 1000000 * STEP;
    uint256 constant FORCED = 7 * STEP;
    bytes32 constant ID = keccak256("security-probe");
    address constant FIRST = address(0x1001);
    address constant SECOND = address(0x2001);
    address constant OTHER_PAYER = address(0x3001);
    ArcRewardDistributor target;

    function setUp() public {
        target = new ArcRewardDistributor(MAXIMUM);
        vm.deal(address(this), FUNDING);
        vm.deal(OTHER_PAYER, FUNDING);
    }

    function lists(address second) internal pure returns (address payable[] memory r, uint256[] memory a) {
        r = new address payable[](2);
        a = new uint256[](2);
        r[0] = payable(FIRST);
        r[1] = payable(second);
        a[0] = STEP;
        a[1] = STEP;
    }

    function testGasBombRollsBackAndIdRemainsReusable() public {
        GasBomb bomb = new GasBomb();
        (address payable[] memory r, uint256[] memory a) = lists(address(bomb));
        uint256 beforeBalance = address(this).balance;
        (bool ok,) =
            address(target).call{value: 2 * STEP, gas: GAS_LIMIT}(abi.encodeCall(target.distribute, (ID, r, a)));
        require(!ok, "A gas-consuming receiver must fail the batch");
        require(FIRST.balance == 0 && address(bomb).balance == 0, "No recipient may retain a partial payment");
        require(address(this).balance == beforeBalance, "The supplied principal must be returned");
        require(!target.executed(address(this), ID), "Failure must not consume the batch ID");
        (r, a) = lists(SECOND);
        target.distribute{value: 2 * STEP}(ID, r, a);
        require(target.executed(address(this), ID), "The original batch ID must remain reusable");
    }

    function testForcedValueBypassesReceiveButCannotBeSwept() public {
        new ForceValue{value: FORCED}(payable(address(target)));
        require(address(target).balance == FORCED, "A receive guard cannot prevent forced credits");
        (address payable[] memory r, uint256[] memory a) = lists(SECOND);
        target.distribute{value: 2 * STEP}(ID, r, a);
        require(address(target).balance == FORCED, "Distribution must not spend pre-existing funds");
    }

    function testOtherPayerCannotConsumeVictimBatchAndPayloadCannotReplay() public {
        (address payable[] memory r, uint256[] memory a) = lists(SECOND);
        vm.prank(OTHER_PAYER);
        target.distribute{value: 2 * STEP}(ID, r, a);
        require(!target.executed(address(this), ID), "Another payer cannot consume this payer batch ID");
        target.distribute{value: 2 * STEP}(ID, r, a);
        a[1] = 2 * STEP;
        (bool ok,) = address(target).call{value: 3 * STEP}(abi.encodeCall(target.distribute, (ID, r, a)));
        require(
            !ok && FIRST.balance == 2 * STEP && SECOND.balance == 2 * STEP,
            "Changing amounts cannot bypass an executed batch ID"
        );
    }

    function testLargeReturnDataDoesNotBreakDistribution() public {
        ReturnBomb bomb = new ReturnBomb();
        (address payable[] memory r, uint256[] memory a) = lists(address(bomb));
        target.distribute{value: 2 * STEP, gas: GAS_LIMIT}(ID, r, a);
        require(FIRST.balance == STEP && address(bomb).balance == STEP, "Large return data must not corrupt payments");
    }
}
