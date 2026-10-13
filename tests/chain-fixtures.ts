import { vi } from "vitest";
import {
  encodeEventTopics,
  encodeAbiParameters,
  encodeFunctionData,
  type Hex,
} from "viem";
import { distributorAbi } from "../src/generated/abi";
import { makeRecord, hash } from "./fixtures";
import type {
  Gateway,
  ChainTransaction,
  ChainReceipt,
  ChainLog,
} from "../src/chain/types";
export function chainEvidence(record = makeRecord()) {
  const s = record.snapshot;
  const logs: ChainLog[] = s.recipients.map((r) => ({
    address: s.contractAddress,
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [BigInt(r.recipientIndex), BigInt(r.amountNative)],
    ),
    topics: encodeEventTopics({
      abi: distributorAbi,
      eventName: "RewardPaid",
      args: { payer: s.payer, batchId: s.batchId, recipient: r.address },
    }) as Hex[],
    transactionHash: hash,
  }));
  logs.push({
    address: s.contractAddress,
    data: encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }],
      [s.payloadHash, BigInt(s.recipients.length), BigInt(s.totalNative)],
    ),
    topics: encodeEventTopics({
      abi: distributorAbi,
      eventName: "BatchPaid",
      args: { payer: s.payer, batchId: s.batchId },
    }) as Hex[],
    transactionHash: hash,
  });
  const tx: ChainTransaction = {
    hash,
    from: s.payer,
    to: s.contractAddress,
    value: BigInt(s.totalNative),
    input: encodeFunctionData({
      abi: distributorAbi,
      functionName: "distribute",
      args: [
        s.batchId,
        s.recipients.map((r) => r.address),
        s.recipients.map((r) => BigInt(r.amountNative)),
      ],
    }),
    nonce: 3,
  };
  const receipt: ChainReceipt = {
    transactionHash: hash,
    from: s.payer,
    to: s.contractAddress,
    status: "success",
    blockNumber: 10n,
    gasUsed: 100n,
    effectiveGasPrice: 2n,
    logs,
  };
  return { record, tx, receipt };
}
export function mockGateway(): Gateway {
  const { tx, receipt } = chainEvidence();
  return {
    chainId: vi.fn(async () => 5042002),
    code: vi.fn(async () => "0x1234" as const),
    version: vi.fn(async () => "1.0.0"),
    maxRecipients: vi.fn(async () => 2n),
    executed: vi.fn(async () => false),
    balance: vi.fn(async () => 10n ** 20n),
    simulate: vi.fn(async () => {}),
    estimateGas: vi.fn(async () => 100n),
    fees: vi.fn(async () => ({ maxFeePerGas: 2n, maxPriorityFeePerGas: 1n })),
    block: vi.fn(async () => 10n),
    transaction: vi.fn(async () => tx),
    receipt: vi.fn(async () => receipt),
    logs: vi.fn(async () => receipt.logs),
    wait: vi.fn(async () => receipt),
  };
}
