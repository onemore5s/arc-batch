import { describe, it, expect, vi, afterEach } from "vitest";
import { encodeFunctionData, keccak256, type Hex } from "viem";
import {
  chainForId,
  InjectedWallet,
  RpcGateway,
  discoverWallets,
  loadDeployment,
  validateDeployment,
  restoreTransaction,
  type Provider,
} from "../src/chain/adapters";
import { distributorAbi } from "../src/generated/abi";
import { hash, payer, contract, makeRecord } from "./fixtures";
import { mockGateway, chainEvidence } from "./chain-fixtures";
import type { Deployment } from "../src/domain/types";
export function makeDeployment(): Deployment {
  return {
    chainId: 5042002,
    contractAddress: contract,
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
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (window as Window & { ethereum?: Provider }).ethereum;
});
describe("RPC and deployment evidence adapters", () => {
  it("uses exact calldata/value with fees, receipts, paginated logs, and replacement callbacks", async () => {
    const g = new RpcGateway(5042002),
      s = makeRecord().snapshot,
      c = g.client,
      e = chainEvidence();
    vi.spyOn(c, "getChainId").mockResolvedValue(5042002);
    expect(await g.chainId()).toBe(5042002);
    const code = vi.spyOn(c, "getCode").mockResolvedValue("0x1234");
    expect(await g.code(contract)).toBe("0x1234");
    code.mockResolvedValue(undefined);
    expect(await g.code(contract)).toBe("0x");
    const read = vi.spyOn(c, "readContract");
    read.mockResolvedValue("1.0.0" as never);
    expect(await g.version(contract)).toBe("1.0.0");
    read.mockResolvedValue(2n as never);
    expect(await g.maxRecipients(contract)).toBe(2n);
    read.mockResolvedValue(false as never);
    expect(await g.executed(s)).toBe(false);
    vi.spyOn(c, "getBalance").mockResolvedValue(5n);
    expect(await g.balance(payer)).toBe(5n);
    const call = vi.spyOn(c, "call").mockResolvedValue({ data: "0x" });
    await g.simulate(s);
    expect(call.mock.calls[0][0].value).toBe(BigInt(s.totalNative));
    vi.spyOn(c, "estimateGas").mockResolvedValue(100n);
    expect(await g.estimateGas(s)).toBe(100n);
    vi.spyOn(c, "estimateFeesPerGas").mockResolvedValue({
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
    } as never);
    vi.spyOn(c, "getGasPrice").mockResolvedValue(2n);
    expect((await g.fees()).maxFeePerGas).toBe(2n);
    vi.mocked(c.getGasPrice).mockResolvedValueOnce(1n);
    expect((await g.fees()).maxFeePerGas).toBe(2n);
    vi.mocked(c.getGasPrice).mockResolvedValueOnce(3n);
    expect((await g.fees()).maxFeePerGas).toBe(3n);
    vi.spyOn(c, "getBlockNumber").mockResolvedValue(10n);
    expect(await g.block()).toBe(10n);
    vi.spyOn(c, "getTransaction").mockResolvedValue(e.tx as never);
    expect((await g.transaction(hash)).hash).toBe(hash);
    vi.spyOn(c, "getTransactionReceipt").mockResolvedValue(e.receipt as never);
    expect((await g.receipt(hash)).status).toBe("success");
    const logs = vi.spyOn(c, "getLogs").mockResolvedValue([]);
    await g.logs(s, 2n, 3n);
    expect(logs.mock.calls[0][0]).toMatchObject({
      address: contract,
      fromBlock: 2n,
      toBlock: 3n,
    });
    vi.spyOn(c, "waitForTransactionReceipt").mockImplementation(
      async (args) => {
        args.onReplaced?.({
          reason: "repriced",
          replacedTransaction: e.tx as never,
          transaction: e.tx as never,
          transactionReceipt: e.receipt as never,
        });
        return e.receipt as never;
      },
    );
    const onReplace = vi.fn();
    await g.wait(hash, onReplace);
    expect(onReplace).toHaveBeenCalledWith({
      reason: "repriced",
      oldHash: hash,
      newHash: hash,
    });
    expect(() => chainForId(1)).toThrow();
    expect(chainForId(5042).name).toBe("Arc Mainnet");
  });
  it("rejects missing, invalid, oversized, or failed deployment manifests", async () => {
    expect(await loadDeployment(undefined)).toEqual([]);
    await expect(loadDeployment("../fake.json")).rejects.toThrow();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockResolvedValue(new Response(JSON.stringify(makeDeployment())));
    expect(await loadDeployment("testnet.json")).toHaveLength(1);
    fetcher.mockResolvedValue(new Response("", { status: 404 }));
    await expect(loadDeployment("testnet.json")).rejects.toThrow();
    fetcher.mockResolvedValue(new Response("{}"));
    await expect(loadDeployment("testnet.json")).rejects.toThrow();
    fetcher.mockResolvedValue(new Response("x".repeat(3 * 1024 * 1024)));
    await expect(loadDeployment("testnet.json")).rejects.toThrow();
  });
  it("requires matching deployment code, chain, version, and constructor limit", async () => {
    const d = makeDeployment();
    expect(await validateDeployment(d, mockGateway())).toEqual(d);
    for (const change of [
      { chainId: async () => 1 },
      { code: async () => "0x" as Hex },
      { code: async () => "0x12" as Hex },
      { version: async () => "bad" },
      { maxRecipients: async () => 1n },
    ])
      await expect(
        validateDeployment(d, { ...mockGateway(), ...change }),
      ).rejects.toThrow();
    await expect(
      validateDeployment({ ...d, version: "bad" }, mockGateway()),
    ).rejects.toThrow();
  });
  it("recovers real calls and handles invalid targets, calldata, and missing receipts conservatively", async () => {
    const d = makeDeployment(),
      g = mockGateway();
    expect((await restoreTransaction(hash, d, g)).status).toBe("confirmed");
    g.receipt = async () => {
      throw new Error("未确认");
    };
    expect((await restoreTransaction(hash, d, g)).status).toBe("unknown");
    await expect(restoreTransaction("0x" as Hex, d, g)).rejects.toThrow();
    g.chainId = async () => 1;
    await expect(restoreTransaction(hash, d, g)).rejects.toThrow();
    g.chainId = async () => 5042002;
    g.transaction = async () => ({ ...chainEvidence().tx, to: payer });
    await expect(restoreTransaction(hash, d, g)).rejects.toThrow();
    g.transaction = async () => ({
      ...chainEvidence().tx,
      input: encodeFunctionData({
        abi: distributorAbi,
        functionName: "version",
      }),
    });
    await expect(restoreTransaction(hash, d, g)).rejects.toThrow();
  });
});
describe("Injected wallets and discovery", () => {
  function provider() {
    const listeners = new Map<string, () => void>();
    const p = {
      request: vi.fn(
        async ({
          method,
        }: {
          method: string;
          params?: unknown[];
        }): Promise<unknown> => {
          if (method === "eth_accounts" || method === "eth_requestAccounts")
            return [payer];
          if (method === "eth_chainId") return "0x4cef52";
          if (method === "eth_sendTransaction") return hash;
          return null;
        },
      ),
      on: vi.fn((name: string, listener: () => void) =>
        listeners.set(name, listener),
      ),
      removeListener: vi.fn((name: string) => listeners.delete(name)),
    };
    return { p, listeners };
  }
  it("connects, submits exact transaction parameters, and manages subscriptions", async () => {
    const { p, listeners } = provider(),
      w = new InjectedWallet("钱包", p);
    expect((await w.connect()).payer).toBe(payer);
    const listener = vi.fn(),
      unsubscribe = w.subscribe(listener);
    listeners.get("chainChanged")!();
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    unsubscribe();
    expect(p.removeListener).toHaveBeenCalledTimes(3);
    const s = makeRecord().snapshot;
    const tx = await w.send(s, {
      gasLimit: 100n,
      maxFeePerGas: 2n,
      maxPriorityFeePerGas: 1n,
      estimatedFee: 200n,
      requiredBalance: 1n,
      balance: 1n,
      block: 1n,
    });
    expect(tx).toBe(hash);
    const request = p.request.mock.calls.find(
      ([a]) => a.method === "eth_sendTransaction",
    )?.[0];
    expect(request).toBeTruthy();
  });
  it("blocks signing on invalid chains, empty accounts, and disconnection", async () => {
    const { p, listeners } = provider(),
      w = new InjectedWallet("钱包", p),
      s = makeRecord().snapshot;
    p.request.mockImplementation(async ({ method }) =>
      method === "eth_accounts" ? [] : "0x4cef52",
    );
    await expect(w.context()).rejects.toThrow();
    const listener = vi.fn();
    w.subscribe(listener);
    listeners.get("disconnect")!();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(undefined));
    for (const chain of ["bad", "0x20000000000000"]) {
      p.request.mockImplementation(async ({ method }) =>
        method === "eth_accounts" ? [payer] : chain,
      );
      await expect(w.context()).rejects.toThrow();
    }
    p.request.mockImplementation(async ({ method }) =>
      method === "eth_accounts" ? [payer] : "0x1",
    );
    await expect(
      w.send(s, {
        gasLimit: 1n,
        maxFeePerGas: 2n,
        maxPriorityFeePerGas: 1n,
        estimatedFee: 0n,
        requiredBalance: 0n,
        balance: 0n,
        block: 0n,
      }),
    ).rejects.toThrow();
  });
  it("switches or adds networks without swallowing unrelated wallet errors", async () => {
    const { p } = provider(),
      w = new InjectedWallet("钱包", p);
    await w.switchNetwork(5042002);
    p.request.mockRejectedValueOnce({ code: 4902 });
    await w.switchNetwork(5042002);
    expect(
      p.request.mock.calls.some(
        ([r]) => r.method === "wallet_addEthereumChain",
      ),
    ).toBe(true);
    p.request.mockRejectedValueOnce({ code: 4001 });
    await expect(w.switchNetwork(5042)).rejects.toEqual({ code: 4001 });
  });
  it("deduplicates EIP-6963 discovery and handles fallback or missing wallets", async () => {
    expect(await discoverWallets()).toEqual([]);
    const { p } = provider();
    Object.assign(window, { ethereum: p });
    expect(await discoverWallets()).toHaveLength(1);
    const icon = "data:image/png;base64,dGVzdA==";
    const announce = () => {
      for (let i = 0; i < 2; i++)
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", {
            detail: { info: { name: "测试发现", icon }, provider: p },
          }),
        );
    };
    window.addEventListener("eip6963:requestProvider", announce);
    const wallets = await discoverWallets();
    window.removeEventListener("eip6963:requestProvider", announce);
    expect(wallets).toHaveLength(1);
    expect(wallets[0].name).toBe("测试发现");
    expect(wallets[0].icon).toBe(icon);
  });
});
