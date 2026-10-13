import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import { parseAmount, formatNative, sumAmounts } from "../src/domain/amount";
import { parseCsv, parsePaste, validateRows } from "../src/domain/recipients";
import {
  payloadHash,
  makeSnapshot,
  newBatchId,
  transition,
} from "../src/domain/batch";
import {
  importBackup,
  exportBackup,
  exportReport,
} from "../src/domain/reports";
import { UINT256_MAX, AMOUNT_STEP } from "../src/config";
import { payer, contract, a, b, batchId, makeRecord } from "./fixtures";

describe("Exact amounts", () => {
  it.each([
    ["1", 10n ** 18n],
    [" 0.000001 ", AMOUNT_STEP],
    ["1.234567", 1234567000000000000n],
    ["0001.20", 1200000000000000000n],
  ])("encodes %s at native precision", (s, n) =>
    expect(parseAmount(s)).toBe(n),
  );
  it.each([
    "",
    "0",
    "0.000000",
    "-1",
    "+1",
    "1e3",
    "1,000",
    "NaN",
    "Infinity",
    ".1",
    "1.",
    "1.0000001",
  ])("rejects %s", (s) => expect(() => parseAmount(s)).toThrow());
  it("checks individual and total uint256 overflow", () => {
    expect(() => parseAmount(UINT256_MAX.toString())).toThrow();
    expect(() => sumAmounts([UINT256_MAX, 1n])).toThrow();
    expect(sumAmounts([1n, 2n])).toBe(3n);
  });
  it("preserves full fee and balance precision", () => {
    expect(formatNative(1n)).toBe("0.000000000000000001");
    expect(formatNative(1200000000000000000n)).toBe("1.2");
    expect(formatNative(0n)).toBe("0");
    expect(() => formatNative(-1n)).toThrow();
  });
});

describe("Recipient parsing and validation", () => {
  it("将每个字段的错误单独定位，同时阻止无效名单生成付款快照", () => {
    const result = validateRows(
      [{ sourceRow: 7, address: "", amount: "", label: "" }],
      {},
    );
    expect(result.rowErrors.get(7)).toEqual({
      address: "请输入收款地址",
      amount: "请输入金额",
    });
    expect(result.recipients).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(result.formErrors).toEqual([]);
    expect(validateRows([], {}).formErrors).toEqual(["请添加至少一位收款人"]);
  });
  it("parses BOM, CRLF, quotes, header order, and original rows", () => {
    const rows = parseCsv(
      `\uFEFFlabel,amount,address\r\n"奖项,一",0.000001,${b}\r\n二,2,${a}`,
    );
    expect(rows[0]).toMatchObject({
      label: "奖项,一",
      amount: "0.000001",
      address: b,
      sourceRow: 2,
    });
    const result = validateRows(rows, { payer, contract, maxRecipients: 2 });
    expect(result.errors).toEqual([]);
    expect(result.recipients.map((r) => r.address)).toEqual([
      getAddress(a),
      getAddress(b),
    ]);
    expect(result.recipients[1].amountNative).toBe(AMOUNT_STEP.toString());
  });
  it.each([
    "address,amount,extra\na,1,b",
    "amount\n1",
    "address,address,amount\na,a,1",
    "address,amount\na,1,more",
    'address,amount\n"unfinished,1',
  ])("never silently discards malformed CSV", (csv) =>
    expect(() => parseCsv(csv)).toThrow(),
  );
  it("parses tab/space-separated input and retains invalid rows", () => {
    expect(parsePaste(`${a}\t1\n${b} 2`)).toHaveLength(2);
    expect(() => parsePaste("bad single")).not.toThrow();
    expect(() => parsePaste("one")).toThrow();
  });
  it("blocks empty, oversized, duplicate, forbidden, invalid-checksum, and invalid-amount lists", () => {
    expect(
      validateRows([], { maxRecipients: 2 }).errors.length,
    ).toBeGreaterThan(0);
    expect(
      validateRows(
        parsePaste(`${a} 1\n${a.toUpperCase().replace("0X", "0x")} 2`),
        { maxRecipients: 1 },
      ).errors.join(),
    ).toMatch(/上限|重复/);
    for (const address of [
      "0x0000000000000000000000000000000000000000",
      payer,
      contract,
      "wrong",
      "0x52908400098527886E0F7030069857D2E4169Ee7",
    ]) {
      expect(
        validateRows([{ address, amount: "1", sourceRow: 1, label: "" }], {
          payer,
          contract,
          maxRecipients: 2,
        }).errors.length,
      ).toBeGreaterThan(0);
    }
    expect(
      validateRows([{ address: a, amount: "0", sourceRow: 1, label: "" }], {
        maxRecipients: 2,
      }).errors.length,
    ).toBeGreaterThan(0);
  });
});

describe("Frozen snapshots and state", () => {
  it("uses nonzero secure random IDs and ABI-encoded digests", () => {
    expect(newBatchId()).toMatch(/^0x[0-9a-f]{64}$/);
    const snapshot = makeSnapshot({
      payer,
      contractAddress: contract,
      chainId: 5042002,
      batchId,
      recipients: makeRecord().snapshot.recipients,
    });
    expect(snapshot.payloadHash).toBe(payloadHash(snapshot.recipients));
    expect(snapshot.totalNative).toBe("3000000000000000000");
    expect(() =>
      makeSnapshot({ ...snapshot, batchId: `0x${"0".repeat(64)}` }),
    ).toThrow();
  });
  it("prevents unverified success and keeps uncertain signatures unknown", () => {
    expect(transition("ready", "sign")).toBe("awaiting_signature");
    expect(transition("awaiting_signature", "uncertain")).toBe("unknown");
    expect(transition("unknown", "verified")).toBe("confirmed");
    expect(transition("awaiting_signature", "reject")).toBe("ready");
    expect(transition("pending", "revert")).toBe("reverted");
    expect(transition("pending", "cancel")).toBe("cancelled");
    expect(transition("unknown", "retry")).toBe("ready");
    expect(() => transition("confirmed", "retry")).toThrow();
    expect(() => transition("draft", "verified")).toThrow();
  });
});

describe("Reports and backups distrust local success labels", () => {
  it("preserves bigint strings and downgrades imported success to unknown", () => {
    const record = makeRecord();
    record.status = "confirmed";
    const [restored] = importBackup(exportBackup([record]));
    expect(restored.status).toBe("unknown");
    expect(restored.snapshot).toEqual(record.snapshot);
    expect(() => importBackup("{bad")).toThrow();
    expect(() =>
      importBackup(JSON.stringify({ schemaVersion: 999, records: [] })),
    ).toThrow();
    const forged = JSON.parse(exportBackup([record]));
    forged.records[0].snapshot.totalNative = "1";
    expect(() => importBackup(JSON.stringify(forged))).toThrow();
  });
  it("escapes CSV formulas and never labels unverified payments as paid", () => {
    const record = makeRecord();
    record.activityName = "=cmd";
    record.snapshot.recipients[0].label = "@evil";
    expect(exportReport(record)).toContain("'=cmd");
    expect(exportReport(record)).toContain("'@evil");
    expect(exportReport(record)).not.toContain("Paid (verified onchain)");
    expect(exportReport(record, "zh-CN")).not.toContain("已发放");
    record.status = "confirmed";
    expect(exportReport(record)).not.toContain("Paid (verified onchain)");
    expect(exportReport(record, "zh-CN")).not.toContain("已发放");
  });
});
