import Papa from "papaparse";
import { backupSchema } from "./schema";
import { makeSnapshot } from "./batch";
import { checkFileSize } from "./recipients";
import { formatNative } from "./amount";
import type { BatchRecord } from "./types";
import { STATUS_LABELS } from "../config";
import { LANGUAGE, translate, type Locale } from "../i18n/core";
export function exportBackup(records: BatchRecord[]) {
  return JSON.stringify({ schemaVersion: 1, records }, null, 2);
}
export function importBackup(text: string): BatchRecord[] {
  checkFileSize(text);
  const parsed = backupSchema.parse(JSON.parse(text));
  return parsed.records.map((raw) => {
    const record = raw as BatchRecord,
      snapshot = makeSnapshot(record.snapshot);
    if (
      snapshot.payloadHash.toLowerCase() !==
        record.snapshot.payloadHash.toLowerCase() ||
      snapshot.totalNative !== record.snapshot.totalNative
    )
      throw new Error("备份名单摘要或总额不匹配");
    const attempts = record.attempts.map((raw) => {
      const attempt = { ...raw };
      delete attempt.receipt;
      return attempt;
    });
    return {
      ...record,
      snapshot,
      attempts,
      status: "unknown",
      evidence: undefined,
    };
  });
}
export function safeCsvCell(value: string) {
  return /^[\s]*[=+\-@\t\r\n]/.test(value) || /^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
}
export function exportReport(
  record: BatchRecord,
  locale: Locale = LANGUAGE.defaultLocale,
) {
  const s = record.snapshot;
  return (
    "\uFEFF" +
    Papa.unparse(
      s.recipients.map((r) => ({
        activity: safeCsvCell(record.activityName),
        chainId: s.chainId,
        contract: s.contractAddress,
        payer: s.payer,
        batchId: s.batchId,
        payloadHash: s.payloadHash,
        transactionHash:
          record.evidence?.transactionHash ??
          record.attempts.at(-1)?.currentHash ??
          "",
        address: r.address,
        amount: formatNative(BigInt(r.amountNative)),
        status: translate(
          record.status === "confirmed" && record.evidence
            ? "已发放（链上核验）"
            : STATUS_LABELS[
                record.status === "confirmed" ? "unknown" : record.status
              ],
          locale,
        ),
        sourceRow: r.sourceRow,
        label: safeCsvCell(r.label),
      })),
    )
  );
}
