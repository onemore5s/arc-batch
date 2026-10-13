import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  zeroAddress,
  type Hex,
} from "viem";
import { validAddress } from "./address";
import { PROTOCOL, ZERO_BATCH } from "../config";
import { validateRows } from "./recipients";
import type { BatchStatus, RewardRow, Snapshot, BatchRecord } from "./types";
export function payloadHash(recipients: RewardRow[]): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "address[]" }, { type: "uint256[]" }],
      [
        recipients.map((r) => r.address),
        recipients.map((r) => BigInt(r.amountNative)),
      ],
    ),
  );
}
export function newBatchId(): Hex {
  let id: Hex;
  do {
    id = `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}`;
  } while (id === ZERO_BATCH);
  return id;
}
export function makeSnapshot(
  input: Omit<Snapshot, "payloadHash" | "totalNative">,
): Snapshot {
  if (
    !Number.isSafeInteger(input.chainId) ||
    input.chainId <= 0 ||
    !/^0x[0-9a-fA-F]{64}$/.test(input.batchId) ||
    input.batchId === ZERO_BATCH
  )
    throw new Error("网络或批次 ID 无效");
  for (const address of [input.payer, input.contractAddress])
    if (!validAddress(address) || address.toLowerCase() === zeroAddress)
      throw new Error("付款人或合约地址无效");
  const result = validateRows(input.recipients, {
    payer: input.payer,
    contract: input.contractAddress,
  });
  if (result.errors.length) throw new Error(result.errors.join("；"));
  if (
    input.recipients.some(
      (r, i) =>
        r.recipientIndex !== i ||
        r.address.toLowerCase() !==
          result.recipients[i].address.toLowerCase() ||
        r.amountNative !== result.recipients[i].amountNative,
    )
  )
    throw new Error("冻结名单排序或金额不一致");
  return {
    ...input,
    payer: getAddress(input.payer),
    contractAddress: getAddress(input.contractAddress),
    recipients: result.recipients,
    payloadHash: payloadHash(result.recipients),
    totalNative: result.total.toString(),
  };
}
export function createRecord(
  snapshot: Snapshot,
  activityName: string,
): BatchRecord {
  return {
    schemaVersion: PROTOCOL.schemaVersion,
    localId: crypto.randomUUID(),
    snapshot,
    activityName,
    status: "ready",
    createdAt: new Date().toISOString(),
    attempts: [],
  };
}
export function recordKey(s: Snapshot) {
  return `${s.chainId}:${s.contractAddress.toLowerCase()}:${s.payer.toLowerCase()}:${s.batchId.toLowerCase()}`;
}
export type BatchEvent =
  | "review"
  | "sign"
  | "reject"
  | "broadcast"
  | "verified"
  | "revert"
  | "cancel"
  | "uncertain"
  | "retry";
const transitions: Partial<
  Record<BatchStatus, Partial<Record<BatchEvent, BatchStatus>>>
> = {
  draft: { review: "ready" },
  ready: { sign: "awaiting_signature", uncertain: "unknown" },
  awaiting_signature: {
    reject: "ready",
    broadcast: "pending",
    uncertain: "unknown",
  },
  pending: {
    verified: "confirmed",
    revert: "reverted",
    cancel: "cancelled",
    uncertain: "unknown",
  },
  unknown: {
    verified: "confirmed",
    revert: "reverted",
    cancel: "cancelled",
    retry: "ready",
    uncertain: "unknown",
  },
  reverted: { retry: "ready" },
  cancelled: { retry: "ready" },
};
export function transition(state: BatchStatus, event: BatchEvent): BatchStatus {
  const next = transitions[state]?.[event];
  if (!next) throw new Error(`不允许的状态转换：${state} → ${event}`);
  return next;
}
