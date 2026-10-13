import Papa from "papaparse";
import { zeroAddress } from "viem";
import { normalizeAddress } from "./address";
import { SETTINGS } from "../config";
import { parseAmount, sumAmounts } from "./amount";
import type { InputRow, RewardRow } from "./types";
export function checkFileSize(text: string) {
  if (new TextEncoder().encode(text).length > SETTINGS.maxFileBytes)
    throw new Error("文件超过大小上限");
}
export function parseCsv(text: string): InputRow[] {
  checkFileSize(text);
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length)
    throw new Error(`CSV 格式错误：${parsed.errors[0].message}`);
  const [rawHeader, ...data] = parsed.data;
  if (!rawHeader) throw new Error("CSV 缺少表头");
  const header = rawHeader.map((s) => s.trim());
  if (
    new Set(header).size !== header.length ||
    !header.includes("address") ||
    !header.includes("amount") ||
    header.some((s) => !["address", "amount", "label"].includes(s))
  )
    throw new Error("表头必须含 address、amount，仅可添加 label");
  return data.map((cells, i) => {
    if (cells.length !== header.length)
      throw new Error(`第 ${i + 2} 行列数与表头不一致`);
    const value = (key: string) => cells[header.indexOf(key)]?.trim() ?? "";
    return {
      sourceRow: i + 2,
      address: value("address"),
      amount: value("amount"),
      label: value("label"),
    };
  });
}
export function parsePaste(text: string): InputRow[] {
  checkFileSize(text);
  return text.split(/\r?\n/).flatMap((line, i) => {
    if (!line.trim()) return [];
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 2)
      throw new Error(`第 ${i + 1} 行需要地址和金额，用空格或制表符分隔`);
    return [
      { sourceRow: i + 1, address: fields[0], amount: fields[1], label: "" },
    ];
  });
}
export function validateRows(
  rows: InputRow[],
  context: { payer?: string; contract?: string; maxRecipients?: number },
) {
  const formErrors: string[] = [],
    rowErrors = new Map<
      number,
      Partial<Record<"address" | "amount" | "label", string>>
    >(),
    recipients: RewardRow[] = [],
    seen = new Set<string>();
  if (!rows.length) formErrors.push("请添加至少一位收款人");
  if (
    context.maxRecipients !== undefined &&
    rows.length > context.maxRecipients
  )
    formErrors.push(`人数超过合约上限 ${context.maxRecipients}`);
  for (const row of rows) {
    const fields: Partial<Record<"address" | "amount" | "label", string>> = {};
    let address: ReturnType<typeof normalizeAddress> | undefined;
    let amountNative: bigint | undefined;
    try {
      const raw = row.address.trim();
      if (!raw) throw new Error("请输入收款地址");
      address = normalizeAddress(raw);
      if (
        [zeroAddress, context.payer, context.contract].some(
          (a) => a?.toLowerCase() === address!.toLowerCase(),
        )
      )
        throw new Error("不能发给零地址、付款钱包或发奖合约");
      if (seen.has(address.toLowerCase()))
        throw new Error("收款地址重复，请主动修正");
      seen.add(address.toLowerCase());
    } catch (e) {
      fields.address = (e as Error).message;
    }
    try {
      if (!row.amount.trim()) throw new Error("请输入金额");
      amountNative = parseAmount(row.amount);
    } catch (e) {
      fields.amount = (e as Error).message;
    }
    if (row.label.length > SETTINGS.maxTextLength) fields.label = "标签过长";
    if (Object.keys(fields).length) rowErrors.set(row.sourceRow, fields);
    else
      recipients.push({
        ...row,
        address: address!,
        amount: row.amount.trim(),
        amountNative: amountNative!.toString(),
        recipientIndex: 0,
      });
  }
  let total = 0n;
  try {
    total = sumAmounts(recipients.map((r) => BigInt(r.amountNative)));
  } catch (e) {
    formErrors.push((e as Error).message);
  }
  recipients.sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1));
  recipients.forEach((r, i) => {
    r.recipientIndex = i;
  });
  const errors = [
    ...formErrors,
    ...Array.from(rowErrors, ([row, fields]) =>
      Object.values(fields).map((message) => `第 ${row} 行：${message}`),
    ).flat(),
  ];
  return { recipients, errors, total, rowErrors, formErrors };
}
