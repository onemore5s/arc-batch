import { describe, it, expect, vi } from "vitest";
import {
  prepareRetry,
  recoverBatch,
  submitBatch,
  preflight,
  verifyReceipt,
} from "../src/chain/service";
import { MemoryStore } from "../src/storage";
import { makeRecord, payer, contract, hash } from "./fixtures";
import { chainEvidence, mockGateway } from "./chain-fixtures";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { distributorAbi } from "../src/generated/abi";
const replacementHash = `0x${"3".repeat(64)}` as Hex;
describe("Conservative recovery and transaction replacement", () => {
  it("stores receipts and revert classifications per attempt with exact gas precision", async () => {
    const record = makeRecord();
    record.status = "pending";
    record.attempts = [
      {
        id: "receipt",
        requestedAt: new Date().toISOString(),
        currentHash: hash,
        replacements: [],
      },
    ];
    const gateway = mockGateway();
    gateway.receipt = async () => ({
      ...chainEvidence().receipt,
      status: "reverted",
      gasUsed: 21001n,
      effectiveGasPrice: 30000000001n,
    });
    const result = await recoverBatch(record, gateway);
    expect(result.attempts[0]).toMatchObject({
      errorClass: "reverted",
      receipt: {
        transactionHash: hash,
        status: "reverted",
        gasUsed: "21001",
        effectiveGasPrice: "30000000001",
      },
    });
    expect(record.attempts[0]).not.toHaveProperty("receipt");
  });
  it("keeps an unconfirmed replacement unknown", async () => {
    const record = makeRecord();
    record.status = "unknown";
    record.attempts = [
      {
        id: "replace",
        requestedAt: new Date().toISOString(),
        originalHash: hash,
        currentHash: replacementHash,
        replacements: [
          { oldHash: hash, newHash: replacementHash, reason: "cancelled" },
        ],
      },
    ];
    const g = mockGateway();
    g.receipt = async () => {
      throw new Error("尚未确认");
    };
    g.logs = async () => [];
    expect((await recoverBatch(record, g)).status).toBe("unknown");
  });
  it("keeps a new uncertain attempt unknown despite an older revert", async () => {
    const record = makeRecord();
    record.status = "pending";
    record.attempts = [
      {
        id: "old",
        requestedAt: new Date().toISOString(),
        originalHash: hash,
        currentHash: hash,
        replacements: [],
      },
      { id: "new", requestedAt: new Date().toISOString(), replacements: [] },
    ];
    const g = mockGateway();
    g.receipt = async () => ({
      ...chainEvidence().receipt,
      status: "reverted",
    });
    expect((await recoverBatch(record, g)).status).toBe("unknown");
  });
  it("blocks retries when executed even after a confirmed cancellation or replacement", async () => {
    const record = makeRecord();
    record.status = "unknown";
    record.attempts = [
      {
        id: "replace",
        requestedAt: new Date().toISOString(),
        originalHash: hash,
        currentHash: replacementHash,
        replacements: [
          { oldHash: hash, newHash: replacementHash, reason: "cancelled" },
        ],
      },
    ];
    const g = mockGateway();
    g.transaction = async () => ({
      ...chainEvidence().tx,
      hash: replacementHash,
      to: payer,
      input: "0x",
      value: 0n,
    });
    g.receipt = async () => ({
      ...chainEvidence().receipt,
      transactionHash: replacementHash,
      to: payer,
      logs: [],
    });
    expect((await recoverBatch(record, g)).status).toBe("cancelled");
    g.executed = async () => true;
    expect((await recoverBatch(record, g)).status).toBe("unknown");
    await expect(prepareRetry(record, new MemoryStore(), g)).rejects.toThrow();
  });
  it("retries with the original ID and recipients and rejects unsupported states", async () => {
    const record = makeRecord();
    record.status = "reverted";
    const store = new MemoryStore();
    await store.save(record);
    const retry = await prepareRetry(record, store, mockGateway());
    expect(retry.snapshot).toEqual(record.snapshot);
    expect(retry.status).toBe("ready");
    await expect(prepareRetry(retry, store, mockGateway())).rejects.toThrow();
    const g = mockGateway();
    g.chainId = async () => 1;
    await expect(prepareRetry(record, store, g)).rejects.toThrow();
  });
  it("never signs after context changes or simulation failures", async () => {
    const wallet = {
      context: vi
        .fn()
        .mockResolvedValueOnce({ payer, chainId: 5042002 })
        .mockResolvedValueOnce({ payer: contract, chainId: 5042002 }),
      send: vi.fn(async () => hash),
    };
    await expect(
      submitBatch(makeRecord(), new MemoryStore(), mockGateway(), wallet),
    ).rejects.toThrow(/上下文/);
    expect(wallet.send).not.toHaveBeenCalled();
    const g = mockGateway();
    g.simulate = async () => {
      throw new Error("模拟回滚");
    };
    wallet.context.mockResolvedValue({ payer, chainId: 5042002 });
    await expect(
      submitBatch(makeRecord(), new MemoryStore(), g, wallet),
    ).rejects.toThrow("模拟回滚");
  });
  it("persists repriced hashes, verifies calls, and keeps timeouts unknown", async () => {
    const record = makeRecord(),
      store = new MemoryStore(),
      g = mockGateway(),
      wallet = {
        context: async () => ({ payer, chainId: 5042002 }),
        send: async () => hash,
      };
    g.wait = async (_, onReplaced) => {
      onReplaced({
        oldHash: hash,
        newHash: replacementHash,
        reason: "repriced",
      });
      return { ...chainEvidence().receipt, transactionHash: replacementHash };
    };
    g.transaction = async (h) => ({ ...chainEvidence().tx, hash: h });
    g.receipt = async (h) => ({
      ...chainEvidence().receipt,
      transactionHash: h,
      logs: chainEvidence().receipt.logs.map((l) => ({
        ...l,
        transactionHash: h,
      })),
    });
    const result = await submitBatch(record, store, g, wallet);
    expect(result.status).toBe("confirmed");
    expect(result.attempts[0].currentHash).toBe(replacementHash);
    expect(result.attempts[0].replacements[0].reason).toBe("repriced");
    g.wait = async () => {
      throw new Error("RPC 超时");
    };
    const unknown = await submitBatch(record, new MemoryStore(), g, wallet);
    expect(unknown.status).toBe("unknown");
    expect(unknown.attempts[0].originalHash).toBe(hash);
  });
  it("rejects mismatched event fields, indices, hashes, and unrelated system events", () => {
    const { record, tx, receipt } = chainEvidence(),
      s = record.snapshot;
    const mutations = [
      encodeAbiParameters(
        [{ type: "uint256" }, { type: "uint256" }],
        [99n, 1n],
      ),
      encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [0n, 1n]),
    ];
    for (const data of mutations)
      expect(
        verifyReceipt(
          s,
          tx,
          {
            ...receipt,
            logs: [{ ...receipt.logs[0], data }, ...receipt.logs.slice(1)],
          },
          s.chainId,
        ).status,
      ).toBe("unknown");
    const badBatch = encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }],
      [hash, 2n, BigInt(s.totalNative)],
    );
    expect(
      verifyReceipt(
        s,
        tx,
        {
          ...receipt,
          logs: [
            ...receipt.logs.slice(0, 2),
            { ...receipt.logs[2], data: badBatch },
          ],
        },
        s.chainId,
      ).status,
    ).toBe("unknown");
    expect(
      verifyReceipt(
        s,
        tx,
        {
          ...receipt,
          logs: receipt.logs.map((l) => ({ ...l, removed: true })),
        },
        s.chainId,
      ).status,
    ).toBe("unknown");
    expect(
      verifyReceipt(
        s,
        tx,
        {
          ...receipt,
          logs: receipt.logs.map((l) => ({
            ...l,
            transactionHash: replacementHash,
          })),
        },
        s.chainId,
      ).status,
    ).toBe("unknown");
    const wrong = encodeEventTopics({
      abi: distributorAbi,
      eventName: "RewardPaid",
      args: {
        payer: contract,
        batchId: s.batchId,
        recipient: s.recipients[0].address,
      },
    }) as Hex[];
    expect(
      verifyReceipt(
        s,
        tx,
        {
          ...receipt,
          logs: [
            { ...receipt.logs[0], topics: wrong },
            ...receipt.logs.slice(1),
          ],
        },
        s.chainId,
      ).status,
    ).toBe("unknown");
    expect(
      verifyReceipt({ ...s, payloadHash: hash }, tx, receipt, s.chainId).status,
    ).toBe("unknown");
  });
  it("blocks invalid fees and forged snapshots", async () => {
    const record = makeRecord();
    await expect(
      preflight(
        { ...record.snapshot, totalNative: "1" },
        { payer, chainId: 5042002 },
        mockGateway(),
      ),
    ).rejects.toThrow();
    const g = mockGateway();
    for (const fees of [
      { maxFeePerGas: 0n, maxPriorityFeePerGas: 0n },
      { maxFeePerGas: 1n, maxPriorityFeePerGas: 2n },
      { maxFeePerGas: 1n, maxPriorityFeePerGas: -1n },
    ]) {
      g.fees = async () => fees;
      await expect(
        preflight(record.snapshot, { payer, chainId: 5042002 }, g),
      ).rejects.toThrow();
    }
  });
});
