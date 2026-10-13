// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ArcRewardDistributor} from "../src/ArcRewardDistributor.sol";

interface Vm {
    struct Log {
        bytes32[] topics;
        bytes data;
        address emitter;
    }
    function deal(address, uint256) external;
    function prank(address) external;
    function expectRevert() external;
    function expectRevert(bytes calldata) external;
    function assume(bool) external;
    function recordLogs() external;
    function getRecordedLogs() external returns (Log[] memory);
}

contract Receiver {
    uint256 public received;

    receive() external payable {
        received += msg.value;
    }
}

contract Rejector {
    receive() external payable {
        revert();
    }
}

contract Reentrant {
    ArcRewardDistributor public target;
    bool public blocked;

    constructor(ArcRewardDistributor t) {
        target = t;
    }

    receive() external payable {
        address payable[] memory r = new address payable[](1);
        r[0] = payable(address(1));
        uint256[] memory a = new uint256[](1);
        a[0] = 1e12;
        try target.distribute{value: 1e12}(bytes32(uint256(99)), r, a) {
            revert(unicode"Reentrancy unexpectedly succeeded");
        } catch {
            blocked = true;
        }
    }
}

contract ArcRewardDistributorTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ArcRewardDistributor target;
    uint256 constant STEP = 1e12;
    uint256 constant LIMIT = 3;
    bytes32 constant ID = bytes32(uint256(1));
    address constant PAYER = address(0xF1);

    function setUp() public {
        target = new ArcRewardDistributor(LIMIT);
        vm.deal(PAYER, 100 ether);
        vm.deal(address(this), 100 ether);
    }

    function lists() internal pure returns (address payable[] memory r, uint256[] memory a) {
        r = new address payable[](2);
        r[0] = payable(address(1));
        r[1] = payable(address(2));
        a = new uint256[](2);
        a[0] = STEP;
        a[1] = 2 * STEP;
    }

    function pay(address payable[] memory r, uint256[] memory a, uint256 value) internal {
        vm.prank(PAYER);
        target.distribute{value: value}(ID, r, a);
    }

    function testBalancesAndReplay() public {
        (address payable[] memory r, uint256[] memory a) = lists();
        pay(r, a, 3 * STEP);
        require(address(1).balance == STEP && address(2).balance == 2 * STEP);
        require(target.executed(PAYER, ID));
        require(address(target).balance == 0);
        vm.expectRevert();
        pay(r, a, 3 * STEP);
        target.distribute{value: 3 * STEP}(ID, r, a);
        require(target.executed(address(this), ID));
    }

    function testInvalidConstructorAndBatch() public {
        vm.expectRevert();
        new ArcRewardDistributor(0);
        (address payable[] memory r, uint256[] memory a) = lists();
        vm.expectRevert();
        target.distribute{value: 3 * STEP}(bytes32(0), r, a);
    }

    function testInvalidLists() public {
        address payable[] memory r = new address payable[](0);
        uint256[] memory a = new uint256[](0);
        vm.expectRevert();
        pay(r, a, 0);
        r = new address payable[](4);
        a = new uint256[](4);
        vm.expectRevert();
        pay(r, a, 0);
        (r, a) = lists();
        uint256[] memory short = new uint256[](1);
        vm.expectRevert();
        pay(r, short, 0);
    }

    function testForbiddenAndOrder() public {
        (address payable[] memory r, uint256[] memory a) = lists();
        address[3] memory bad = [address(0), address(target), PAYER];
        for (uint256 i; i < bad.length; ++i) {
            r[0] = payable(bad[i]);
            vm.expectRevert();
            pay(r, a, 3 * STEP);
        }
        r[0] = r[1];
        vm.expectRevert();
        pay(r, a, 3 * STEP);
        r[0] = payable(address(3));
        vm.expectRevert();
        pay(r, a, 3 * STEP);
    }

    function testAmountsAndValue() public {
        (address payable[] memory r, uint256[] memory a) = lists();
        a[0] = 0;
        vm.expectRevert();
        pay(r, a, 2 * STEP);
        a[0] = 1;
        vm.expectRevert();
        pay(r, a, 2 * STEP + 1);
        a[0] = STEP;
        vm.expectRevert();
        pay(r, a, STEP);
        a[0] = type(uint256).max / STEP * STEP;
        a[1] = STEP;
        vm.expectRevert();
        pay(r, a, 0);
    }

    function testAtomicFailureAndRetry() public {
        Rejector bad = new Rejector();
        (address payable[] memory r, uint256[] memory a) = lists();
        r[1] = payable(address(bad));
        vm.expectRevert(abi.encodeWithSelector(ArcRewardDistributor.PaymentFailed.selector, 1, address(bad)));
        pay(r, a, 3 * STEP);
        require(address(1).balance == 0 && !target.executed(PAYER, ID));
        r[1] = payable(address(2));
        pay(r, a, 3 * STEP);
        require(target.executed(PAYER, ID));
    }

    function testContractReceiverAndReentrancy() public {
        Receiver good = new Receiver();
        address payable[] memory r = new address payable[](1);
        r[0] = payable(address(good));
        uint256[] memory a = new uint256[](1);
        a[0] = STEP;
        pay(r, a, STEP);
        require(good.received() == STEP);
        Reentrant attacker = new Reentrant(target);
        r[0] = payable(address(attacker));
        target.distribute{value: STEP}(ID, r, a);
        require(attacker.blocked());
    }

    function testUnexpectedBalanceAndDirectSend() public {
        vm.deal(address(target), 7 * STEP);
        (address payable[] memory r, uint256[] memory a) = lists();
        pay(r, a, 3 * STEP);
        require(address(target).balance == 7 * STEP);
        (bool ok,) = address(target).call{value: STEP}("");
        require(!ok);
        (ok,) = address(target).call{value: STEP}(hex"deadbeef");
        require(!ok);
    }

    function testEventsAndVersion() public {
        require(keccak256(bytes(target.version())) == keccak256(bytes("1.0.0")));
        require(target.maxRecipients() == LIMIT);
        (address payable[] memory r, uint256[] memory a) = lists();
        vm.recordLogs();
        pay(r, a, 3 * STEP);
        Vm.Log[] memory recorded = vm.getRecordedLogs();
        Vm.Log[] memory logs = new Vm.Log[](3);
        uint256 count;
        // Arc emits additional system transfer events; verify only distributor events.
        for (uint256 i; i < recorded.length; ++i) {
            if (recorded[i].emitter == address(target)) {
                require(count < logs.length);
                logs[count++] = recorded[i];
            }
        }
        require(count == logs.length);
        for (uint256 i; i < 2; ++i) {
            require(logs[i].topics[0] == keccak256("RewardPaid(address,bytes32,address,uint256,uint256)"));
            require(logs[i].topics[1] == bytes32(uint256(uint160(PAYER))));
            require(logs[i].topics[2] == ID);
            require(logs[i].topics[3] == bytes32(uint256(uint160(address(r[i])))));
            (uint256 index, uint256 amount) = abi.decode(logs[i].data, (uint256, uint256));
            require(index == i && amount == a[i]);
        }
        require(logs[2].topics[0] == keccak256("BatchPaid(address,bytes32,bytes32,uint256,uint256)"));
        require(logs[2].topics[1] == bytes32(uint256(uint160(PAYER))));
        require(logs[2].topics[2] == ID);
        (bytes32 digest, uint256 recipientCount, uint256 total) = abi.decode(logs[2].data, (bytes32, uint256, uint256));
        require(digest == keccak256(abi.encode(r, a)) && recipientCount == 2 && total == 3 * STEP);
    }

    function testFuzzConservation(uint64 units) public {
        vm.assume(units > 0 && units < 1000000);
        (address payable[] memory r, uint256[] memory a) = lists();
        a[0] = uint256(units) * STEP;
        uint256 total = a[0] + a[1];
        uint256 before = PAYER.balance;
        pay(r, a, total);
        require(before - PAYER.balance == total);
        require(address(1).balance + address(2).balance == total);
        require(address(target).balance == 0);
    }
}

contract PayoutHandler {
    ArcRewardDistributor public immutable target;
    uint256 public distributed;
    uint256 public counter;
    address payable public constant A = payable(address(0xA001));
    address payable public constant B = payable(address(0xB001));

    constructor(ArcRewardDistributor distributor) {
        target = distributor;
    }

    function pay(uint64 seed) external {
        uint256 value = (uint256(seed) % 1000 + 1) * 1e12;
        address payable[] memory r = new address payable[](2);
        r[0] = A;
        r[1] = B;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = value;
        amounts[1] = value;
        bytes32 id = bytes32(++counter);
        target.distribute{value: value * 2}(id, r, amounts);
        distributed += value * 2;
        require(target.executed(address(this), id));
        (bool replay,) = address(target).call{value: value * 2}(abi.encodeCall(target.distribute, (id, r, amounts)));
        require(!replay);
    }
}

contract DistributorInvariantTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    ArcRewardDistributor target;
    PayoutHandler handler;

    function setUp() public {
        target = new ArcRewardDistributor(2);
        handler = new PayoutHandler(target);
        vm.deal(address(handler), 100 ether);
    }

    function targetContracts() public view returns (address[] memory result) {
        result = new address[](1);
        result[0] = address(handler);
    }

    function invariantConservationAndNoRetention() public view {
        require(handler.A().balance + handler.B().balance == handler.distributed());
        require(address(target).balance == 0);
    }
}
