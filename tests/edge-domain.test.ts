import { describe, it, expect, vi } from "vitest";
import { makeRecord, hash } from "./fixtures";
import {
  makeSnapshot,
  newBatchId,
  createRecord,
  transition,
} from "../src/domain/batch";
import {
  validateRows,
  parseCsv,
  parsePaste,
  checkFileSize,
} from "../src/domain/recipients";
import {
  importBackup,
  exportBackup,
  exportReport,
} from "../src/domain/reports";
import { SETTINGS, UINT256_MAX, AMOUNT_STEP } from "../src/config";
describe("Input boundaries and backup integrity", () => {
  it("revalidates imported receipts instead of trusting backup fee or payment evidence", () => {
    const record = makeRecord();
    record.attempts = [
      {
        id: "fake-receipt",
        requestedAt: new Date().toISOString(),
        currentHash: hash,
        replacements: [],
        receipt: {
          transactionHash: hash,
          blockNumber: "1",
          status: "success",
          gasUsed: "1",
          effectiveGasPrice: "1",
        },
      },
    ];
    const [restored] = importBackup(exportBackup([record]));
    expect(restored.attempts[0]).not.toHaveProperty("receipt");
    expect(restored.status).toBe("unknown");
  });
  it("rejects unsupported backup networks", () => {
    const backup = JSON.parse(exportBackup([makeRecord()]));
    backup.records[0].snapshot.chainId = 1;
    expect(() => importBackup(JSON.stringify(backup))).toThrow(/网络/);
  });
  it("resamples zero IDs and rejects invalid snapshots or mismatched amount ordering", () => {
    const random = vi.spyOn(crypto, "getRandomValues");
    random.mockImplementationOnce((a) => a);
    expect(newBatchId()).not.toBe(`0x${"0".repeat(64)}`);
    random.mockRestore();
    const s = makeRecord().snapshot;
    for (const change of [
      { chainId: 0 },
      { chainId: Number.MAX_SAFE_INTEGER + 1 },
      { batchId: "0x" as const },
      { payer: "0x" as const },
      {
        contractAddress: "0x0000000000000000000000000000000000000000" as const,
      },
      { recipients: [s.recipients[1], s.recipients[0]] },
      {
        recipients: [
          { ...s.recipients[0], amountNative: "1" },
          s.recipients[1],
        ],
      },
      {
        recipients: [
          { ...s.recipients[0], recipientIndex: 1 },
          s.recipients[1],
        ],
      },
      { recipients: [{ ...s.recipients[0], amount: "0" }, s.recipients[1]] },
    ])
      expect(() => makeSnapshot({ ...s, ...change })).toThrow();
    expect(createRecord(s, "").status).toBe("ready");
    expect(transition("draft", "review")).toBe("ready");
    expect(transition("awaiting_signature", "broadcast")).toBe("pending");
    expect(transition("cancelled", "retry")).toBe("ready");
  });
  it("rejects oversized files, empty input, long labels, and total overflow", () => {
    expect(() =>
      checkFileSize("x".repeat(SETTINGS.maxFileBytes + 1)),
    ).toThrow();
    expect(() => parseCsv("")).toThrow();
    expect(parsePaste("\n")).toEqual([]);
    const row = makeRecord().snapshot.recipients[0];
    expect(
      validateRows(
        [{ ...row, label: "x".repeat(SETTINGS.maxTextLength + 1) }],
        {},
      ).errors.join(),
    ).toMatch(/标签/);
    const maximal = ((UINT256_MAX / AMOUNT_STEP) * AMOUNT_STEP).toString();
    const whole = BigInt(maximal) / 10n ** 18n,
      fraction = (BigInt(maximal) % 10n ** 18n)
        .toString()
        .padStart(18, "0")
        .slice(0, 6);
    const rows = makeRecord().snapshot.recipients.map((r) => ({
      ...r,
      amount: `${whole}.${fraction}`,
    }));
    expect(validateRows(rows, {}).errors.join()).toMatch(/总额/);
    expect(() =>
      importBackup(
        exportBackup([
          {
            ...makeRecord(),
            snapshot: { ...makeRecord().snapshot, payloadHash: hash },
          },
        ]),
      ),
    ).toThrow();
    const record = makeRecord();
    record.status = "confirmed";
    record.evidence = {
      transactionHash: hash,
      blockNumber: "1",
      gasUsed: "1",
      effectiveGasPrice: "1",
    };
    expect(exportReport(record)).toContain("Paid (verified onchain)");
    expect(exportReport(record, "zh-CN")).toContain("已发放（链上核验）");
  });
});
