import { describe, it, expect, vi } from "vitest";
import { chainEvidence, mockGateway } from "./chain-fixtures";
import {
  verifyReceipt,
  preflight,
  recoverBatch,
  submitBatch,
} from "../src/chain/service";
import { makeRecord, payer, contract, hash } from "./fixtures";
import { MemoryStore } from "../src/storage";

describe("Strict onchain evidence verification", () => {
  it("confirms only matching calls and complete row events without truncating fees", () => {
    const { record, tx, receipt } = chainEvidence();
    expect(verifyReceipt(record.snapshot, tx, receipt, 5042002).status).toBe(
      "confirmed",
    );
    receipt.status = "reverted";
    expect(verifyReceipt(record.snapshot, tx, receipt, 5042002).status).toBe(
      "reverted",
    );
  });
  it("rejects wrong chain, target, payer, value, calldata, and events", () => {
    const { record, tx, receipt } = chainEvidence();
    expect(verifyReceipt(record.snapshot, tx, receipt, 1).status).toBe(
      "unknown",
    );
    for (const bad of [
      { to: payer },
      { from: contract },
      { value: 1n },
      { input: "0x" as const },
    ])
      expect(
        verifyReceipt(record.snapshot, { ...tx, ...bad }, receipt, 5042002)
          .status,
      ).toBe("unknown");
    expect(
      verifyReceipt(
        record.snapshot,
        tx,
        { ...receipt, logs: receipt.logs.slice(1) },
        5042002,
      ).status,
    ).toBe("unknown");
    expect(
      verifyReceipt(
        record.snapshot,
        tx,
        {
          ...receipt,
          logs: receipt.logs.map((l) => ({ ...l, address: payer })),
        },
        5042002,
      ).status,
    ).toBe("unknown");
    expect(
      verifyReceipt(
        record.snapshot,
        tx,
        { ...receipt, logs: [...receipt.logs, receipt.logs[0]] },
        5042002,
      ).status,
    ).toBe("unknown");
    expect(
      verifyReceipt(
        record.snapshot,
        tx,
        { ...receipt, logs: receipt.logs.map((l) => ({ ...l, data: "0x" })) },
        5042002,
      ).status,
    ).toBe("unknown");
  });
});
describe("Preflight, persistence, and unknown outcomes", () => {
  it("blocks insufficient gas balance, wrong networks, missing code, wrong versions, and replay", async () => {
    const record = makeRecord();
    for (const change of [
      { balance: async () => BigInt(record.snapshot.totalNative) },
      { chainId: async () => 1 },
      { code: async () => "0x" as const },
      { version: async () => "bad" },
      { executed: async () => true },
      { maxRecipients: async () => 1n },
    ])
      await expect(
        preflight(
          record.snapshot,
          { payer, chainId: 5042002 },
          { ...mockGateway(), ...change },
        ),
      ).rejects.toThrow();
    await expect(
      preflight(
        record.snapshot,
        { payer: contract, chainId: 5042002 },
        mockGateway(),
      ),
    ).rejects.toThrow();
    const result = await preflight(
      record.snapshot,
      { payer, chainId: 5042002 },
      mockGateway(),
    );
    expect(result.gasLimit).toBe(125n);
    expect(result.requiredBalance).toBe(
      BigInt(record.snapshot.totalNative) + 250n,
    );
  });
  it("blocks signing on storage failure, retains rejected IDs, and preserves uncertain outcomes", async () => {
    const record = makeRecord(),
      wallet = {
        context: vi.fn(async () => ({ payer, chainId: 5042002 })),
        send: vi.fn(async () => hash),
      };
    const store = new MemoryStore();
    vi.spyOn(store, "claim").mockRejectedValue(new Error("配额不足"));
    await expect(
      submitBatch(record, store, mockGateway(), wallet),
    ).rejects.toThrow();
    expect(wallet.send).not.toHaveBeenCalled();
    for (const [error, status] of [
      [{ code: 4001 }, "ready"],
      [new Error("断开"), "unknown"],
    ] as const) {
      const db = new MemoryStore();
      wallet.send.mockRejectedValueOnce(error);
      await submitBatch(record, db, mockGateway(), wallet);
      const saved = await db.get(record.snapshot);
      expect(saved?.status).toBe(status);
      expect(saved?.snapshot.batchId).toBe(record.snapshot.batchId);
    }
  });
  it("persists verified success and prevents duplicate signature requests", async () => {
    const store = new MemoryStore(),
      record = makeRecord(),
      wallet = {
        context: async () => ({ payer, chainId: 5042002 }),
        send: vi.fn(async () => hash),
      };
    await submitBatch(record, store, mockGateway(), wallet);
    expect((await store.get(record.snapshot))?.status).toBe("confirmed");
    await expect(
      submitBatch(record, store, mockGateway(), wallet),
    ).rejects.toThrow();
    expect(wallet.send).toHaveBeenCalledTimes(1);
  });
  it("recovers missing hashes from original batch events and requires full executed evidence", async () => {
    const record = makeRecord();
    record.status = "unknown";
    record.preflightBlock = "1";
    const gateway = mockGateway();
    gateway.executed = async () => true;
    expect((await recoverBatch(record, gateway)).status).toBe("confirmed");
    gateway.logs = async () => [];
    expect((await recoverBatch(record, gateway)).status).toBe("unknown");
    gateway.chainId = async () => 1;
    await expect(recoverBatch(record, gateway)).rejects.toThrow();
  });
});
