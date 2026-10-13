import { describe, it, expect, vi, afterEach } from "vitest";
import { submitBatch, preflight, recoverBatch } from "../src/chain/service";
import { IndexedStore, MemoryStore } from "../src/storage";
import { makeRecord, payer, hash } from "./fixtures";
import { chainEvidence, mockGateway } from "./chain-fixtures";
import { keccak256 } from "viem";
const replacement = `0x${"9".repeat(64)}` as const;
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: undefined,
  });
});
describe("Payment boundaries and cross-tab locks", () => {
  it("prevents slow preflight from overwriting another tab's claim without browser locks", async () => {
    const first = new IndexedStore(),
      second = new IndexedStore(),
      record = makeRecord();
    record.snapshot.batchId = `0x${"5".repeat(64)}`;
    await first.save(record);
    const slowGateway = mockGateway(),
      fastGateway = mockGateway();
    let releaseSimulation!: () => void;
    let startedSimulation!: () => void;
    const started = new Promise<void>((resolve) => {
      startedSimulation = resolve;
    });
    slowGateway.simulate = async () => {
      startedSimulation();
      await new Promise<void>((resolve) => {
        releaseSimulation = resolve;
      });
    };
    let releaseReceipt!: () => void;
    fastGateway.wait = async () => {
      await new Promise<void>((resolve) => {
        releaseReceipt = resolve;
      });
      return chainEvidence().receipt;
    };
    const wallet = {
      context: async () => ({ payer, chainId: 5042002 }),
      send: vi.fn(async () => hash),
    };
    const slow = submitBatch(record, first, slowGateway, wallet);
    const slowRejected = expect(slow).rejects.toThrow(/正在处理|已完成/);
    await started;
    const fast = submitBatch(record, second, fastGateway, wallet);
    await vi.waitFor(async () =>
      expect((await second.get(record.snapshot))?.status).toBe("pending"),
    );
    releaseSimulation();
    await slowRejected;
    expect(wallet.send).toHaveBeenCalledTimes(1);
    releaseReceipt();
    await fast;
    first.close();
    second.close();
  });
  it("rejects concurrent tabs and completes the original batch after acquiring the lock", async () => {
    const wallet = {
        context: async () => ({ payer, chainId: 5042002 }),
        send: async () => hash,
      },
      record = makeRecord();
    const request = vi.fn(
      async (
        _name: string,
        _options: unknown,
        callback: (lock: unknown) => unknown,
      ) => callback(null),
    );
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: { request },
    });
    await expect(
      submitBatch(record, new MemoryStore(), mockGateway(), wallet),
    ).rejects.toThrow("另一个页面");
    request.mockImplementation(async (name, _options, callback) =>
      callback({ name }),
    );
    expect(
      (await submitBatch(record, new MemoryStore(), mockGateway(), wallet))
        .status,
    ).toBe("confirmed");
  });
  it("keeps failed replacement writes unknown, recognizes nested rejection, and never invents a nonce", async () => {
    const g = mockGateway(),
      store = new MemoryStore(),
      wallet = {
        context: async () => ({ payer, chainId: 5042002 }),
        send: vi.fn(async () => hash),
      };
    const save = store.save.bind(store);
    let rejected = false;
    vi.spyOn(store, "save").mockImplementation(async (record) => {
      if (!rejected && record.attempts.at(-1)?.currentHash === replacement) {
        rejected = true;
        throw new Error("存储失败");
      }
      await save(record);
    });
    g.wait = async (_, callback) => {
      callback({ oldHash: hash, newHash: replacement, reason: "repriced" });
      return chainEvidence().receipt;
    };
    const progress = vi.fn();
    const result = await submitBatch(makeRecord(), store, g, wallet, progress);
    expect(result.status).toBe("unknown");
    expect(progress).toHaveBeenCalled();
    wallet.send.mockRejectedValueOnce({ cause: { code: 4001 } });
    expect(
      (
        await submitBatch(
          makeRecord(),
          new MemoryStore(),
          mockGateway(),
          wallet,
        )
      ).status,
    ).toBe("ready");
    const nonce = mockGateway();
    nonce.transaction = async () => {
      throw new Error("不可获取");
    };
    expect(
      (await submitBatch(makeRecord(), new MemoryStore(), nonce, wallet))
        .attempts[0].nonce,
    ).toBeUndefined();
  });
  it("blocks payment on manifest code, network, and limit mismatches", async () => {
    const record = makeRecord(),
      g = mockGateway();
    const deployment = {
      chainId: 5042002,
      contractAddress: record.snapshot.contractAddress,
      deploymentBlock: "1",
      transactionHash: hash,
      maxRecipients: "2",
      version: "1.0.0",
      compiler: "test",
      evmVersion: "paris",
      sourceHash: hash,
      runtimeCodeHash: keccak256("0x1234"),
      abiSource: "generated",
    };
    for (const change of [
      { runtimeCodeHash: hash },
      { chainId: 5042 },
      { contractAddress: payer },
      { maxRecipients: "1" },
    ]) {
      g.deployment = { ...deployment, ...change };
      await expect(
        preflight(record.snapshot, { payer, chainId: 5042002 }, g),
      ).rejects.toThrow();
    }
    await expect(
      preflight(
        { ...record.snapshot, payloadHash: hash },
        { payer, chainId: 5042002 },
        mockGateway(),
      ),
    ).rejects.toThrow("摘要");
    g.deployment = deployment;
    g.maxRecipients = async () => 0n;
    await expect(
      preflight(record.snapshot, { payer, chainId: 5042002 }, g),
    ).rejects.toThrow();
    g.maxRecipients = async () => 2n;
    g.estimateGas = async () => 0n;
    await expect(
      preflight(record.snapshot, { payer, chainId: 5042002 }, g),
    ).rejects.toThrow();
  });
  it("paginates from the preflight block and never infers success without evidence", async () => {
    const record = makeRecord(),
      g = mockGateway();
    record.status = "unknown";
    record.preflightBlock = "1";
    g.executed = async () => true;
    g.block = async () => 2500n;
    const logs = vi.fn(async (_s, from: bigint) =>
      from === 2001n
        ? chainEvidence().receipt.logs
        : [{ ...chainEvidence().receipt.logs[0], transactionHash: null }],
    );
    g.logs = logs;
    expect((await recoverBatch(record, g)).status).toBe("confirmed");
    expect(logs).toHaveBeenCalledTimes(3);
    expect(logs.mock.calls[0][1]).toBe(1n);
    record.preflightBlock = undefined;
    g.logs = async () => [];
    expect((await recoverBatch(record, g)).status).toBe("unknown");
    g.executed = async () => false;
    record.attempts = [
      {
        id: "revert",
        requestedAt: new Date().toISOString(),
        currentHash: hash,
        replacements: [],
      },
    ];
    g.receipt = async () => ({
      ...chainEvidence().receipt,
      status: "reverted",
    });
    expect((await recoverBatch(record, g)).status).toBe("reverted");
  });
});
