// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Protocol} from "./Protocol.sol";

contract ArcRewardDistributor is ReentrancyGuard {
    error InvalidMaximum();
    error InvalidBatchId();
    error BatchAlreadyExecuted();
    error InvalidRecipientCount();
    error LengthMismatch();
    error ForbiddenRecipient(uint256 index, address recipient);
    error UnsortedRecipients(uint256 index);
    error InvalidAmount(uint256 index);
    error ValueMismatch(uint256 expected, uint256 actual);
    error PaymentFailed(uint256 index, address recipient);
    error DirectTransferRejected();
    event RewardPaid(
        address indexed payer,
        bytes32 indexed batchId,
        address indexed recipient,
        uint256 recipientIndex,
        uint256 amount
    );
    event BatchPaid(
        address indexed payer, bytes32 indexed batchId, bytes32 payloadHash, uint256 recipientCount, uint256 totalAmount
    );
    uint256 public immutable maxRecipients;
    mapping(address => mapping(bytes32 => bool)) public executed;

    constructor(uint256 maxRecipients_) {
        if (maxRecipients_ == 0) revert InvalidMaximum();
        maxRecipients = maxRecipients_;
    }

    function version() external pure returns (string memory) {
        return Protocol.VERSION;
    }

    function distribute(bytes32 batchId, address payable[] calldata recipients, uint256[] calldata amounts)
        external
        payable
        nonReentrant
    {
        if (batchId == bytes32(0)) revert InvalidBatchId();
        if (executed[msg.sender][batchId]) revert BatchAlreadyExecuted();
        uint256 count = recipients.length;
        if (count == 0 || count > maxRecipients) revert InvalidRecipientCount();
        if (count != amounts.length) revert LengthMismatch();
        uint256 total;
        for (uint256 i; i < count; ++i) {
            address recipient = recipients[i];
            if (recipient == address(0) || recipient == address(this) || recipient == msg.sender) {
                revert ForbiddenRecipient(i, recipient);
            }
            if (i > 0 && uint160(recipient) <= uint160(address(recipients[i - 1]))) revert UnsortedRecipients(i);
            if (amounts[i] == 0 || amounts[i] % Protocol.AMOUNT_STEP != 0) revert InvalidAmount(i);
            total += amounts[i];
        }
        if (msg.value != total) revert ValueMismatch(total, msg.value);
        executed[msg.sender][batchId] = true;
        for (uint256 i; i < count; ++i) {
            (bool success,) = recipients[i].call{value: amounts[i]}("");
            if (!success) revert PaymentFailed(i, recipients[i]);
            emit RewardPaid(msg.sender, batchId, recipients[i], i, amounts[i]);
        }
        emit BatchPaid(msg.sender, batchId, keccak256(abi.encode(recipients, amounts)), count, total);
    }

    receive() external payable {
        revert DirectTransferRejected();
    }

    fallback() external payable {
        revert DirectTransferRejected();
    }
}
