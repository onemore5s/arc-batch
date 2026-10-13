import type { BatchRecord } from "../src/domain/types";
import { payloadHash } from "../src/domain/batch";
export const payer = "0x00000000000000000000000000000000000000f1" as const;
export const contract = "0x00000000000000000000000000000000000000C1" as const;
export const a = "0x0000000000000000000000000000000000000001" as const;
export const b = "0x0000000000000000000000000000000000000002" as const;
export const batchId = `0x${"1".repeat(64)}` as const;
export const hash = `0x${"2".repeat(64)}` as const;
export function makeRecord(): BatchRecord {
  const recipients = [a, b].map((address, recipientIndex) => ({
    address,
    amountNative: ((BigInt(recipientIndex) + 1n) * 10n ** 18n).toString(),
    amount: String(recipientIndex + 1),
    sourceRow: recipientIndex + 1,
    label: "",
    recipientIndex,
  }));
  return {
    schemaVersion: 1,
    localId: "fixture",
    activityName: "测试活动",
    status: "ready",
    createdAt: new Date().toISOString(),
    snapshot: {
      payer,
      contractAddress: contract,
      chainId: 5042002,
      batchId,
      recipients,
      payloadHash: payloadHash(recipients),
      totalNative: "3000000000000000000",
    },
    attempts: [],
  };
}
