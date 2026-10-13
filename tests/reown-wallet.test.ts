import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "@wagmi/core";
import type { WalletContext } from "../src/chain/types";
import { ReownWallet } from "../src/chain/reown-wallet";
import { NETWORKS } from "../src/config";
import { payer, a, hash, makeRecord } from "./fixtures";

const core = vi.hoisted(() => ({
  getAccount: vi.fn(),
  watchAccount: vi.fn(),
  switchChain: vi.fn(),
}));
vi.mock("@wagmi/core", () => core);
const config = {} as Config;
const preflight = {
  gasLimit: 100n,
  maxFeePerGas: 2n,
  maxPriorityFeePerGas: 1n,
  estimatedFee: 200n,
  requiredBalance: 1n,
  balance: 1n,
  block: 1n,
};
function setup() {
  let changed!: () => void;
  const stop = vi.fn();
  const request = vi.fn(
    async ({ method }: { method: string }): Promise<unknown> => {
      if (method === "eth_accounts") return [payer];
      if (method === "eth_chainId")
        return `0x${NETWORKS.testnet.id.toString(16)}`;
      return hash;
    },
  );
  const connector = {
    uid: "test-connector",
    name: "测试连接",
    getProvider: vi.fn(async () => ({ request })),
  };
  const account = {
    status: "connected",
    isConnected: true,
    address: payer,
    chainId: NETWORKS.testnet.id,
    connector,
  };
  core.getAccount.mockReturnValue(account);
  core.watchAccount.mockImplementation((_config, options) => {
    changed = options.onChange;
    return stop;
  });
  return {
    wallet: new ReownWallet(config),
    account,
    connector,
    request,
    changed: () => changed(),
    stop,
  };
}
beforeEach(() => vi.resetAllMocks());

describe("AppKit wallet adapter", () => {
  it("verifies actual provider context and preserves distribute calldata and native value", async () => {
    const { wallet, request } = setup();
    expect(await wallet.connect()).toEqual({
      payer,
      chainId: NETWORKS.testnet.id,
    });
    expect(await wallet.send(makeRecord().snapshot, preflight)).toBe(hash);
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "eth_sendTransaction",
        params: [
          expect.objectContaining({
            from: payer,
            to: makeRecord().snapshot.contractAddress,
            value: `0x${BigInt(makeRecord().snapshot.totalNative).toString(16)}`,
          }),
        ],
      }),
    );
  });

  it("restores the account and immediately invalidates disconnected or changed context", async () => {
    const { wallet, changed, account, stop } = setup();
    const listener = vi.fn();
    const unsubscribe = wallet.subscribe(listener);
    await vi.waitFor(() =>
      expect(listener).toHaveBeenLastCalledWith({
        payer,
        chainId: NETWORKS.testnet.id,
      }),
    );
    core.getAccount.mockReturnValue({
      status: "reconnecting",
      isConnected: false,
    });
    changed();
    expect(listener).toHaveBeenLastCalledWith(undefined);
    core.getAccount.mockReturnValue(account);
    changed();
    await vi.waitFor(() =>
      expect(listener).toHaveBeenLastCalledWith({
        payer,
        chainId: NETWORKS.testnet.id,
      }),
    );
    unsubscribe();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("discards stale account reads and post-unmount notifications", async () => {
    const { wallet, changed } = setup();
    let finish!: (value: WalletContext) => void;
    vi.spyOn(wallet, "context").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const listener = vi.fn();
    const unsubscribe = wallet.subscribe(listener);
    core.getAccount.mockReturnValue({ isConnected: false });
    changed();
    finish({ payer, chainId: NETWORKS.testnet.id });
    await Promise.resolve();
    expect(listener).toHaveBeenLastCalledWith(undefined);
    unsubscribe();
    changed();
    expect(listener.mock.calls.every(([value]) => value === undefined)).toBe(
      true,
    );
  });

  it("keeps failed provider reads disconnected and blocks mismatched senders", async () => {
    const { wallet, request } = setup();
    request.mockRejectedValueOnce(new Error("已断开"));
    const listener = vi.fn();
    const stop = wallet.subscribe(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith(undefined));
    stop();
    request.mockImplementation(async ({ method }) =>
      method === "eth_accounts" ? [a] : `0x${NETWORKS.testnet.id.toString(16)}`,
    );
    await expect(wallet.send(makeRecord().snapshot, preflight)).rejects.toThrow(
      "钱包或网络已改变",
    );
    expect(
      request.mock.calls.some(
        ([args]) => args.method === "eth_sendTransaction",
      ),
    ).toBe(false);
  });

  it("rejects disconnected, missing, or asynchronously changed providers", async () => {
    const { wallet, account, connector } = setup();
    core.getAccount.mockReturnValue({ isConnected: false });
    await expect(wallet.context()).rejects.toThrow("钱包尚未连接");
    core.getAccount.mockReturnValue({ ...account, connector: undefined });
    await expect(wallet.context()).rejects.toThrow("钱包尚未连接");
    core.getAccount.mockReturnValue(account);
    connector.getProvider.mockResolvedValueOnce(undefined as never);
    await expect(wallet.context()).rejects.toThrow("钱包连接不可用");
    core.getAccount
      .mockReturnValueOnce(account)
      .mockReturnValue({ ...account, address: a });
    await expect(wallet.context()).rejects.toThrow("钱包连接已改变");
  });

  it("switches through the active connector and rejects unsupported chains", async () => {
    const { wallet } = setup();
    await wallet.switchNetwork(NETWORKS.mainnet.id);
    expect(core.switchChain).toHaveBeenCalledWith(
      config,
      expect.objectContaining({ chainId: NETWORKS.mainnet.id }),
    );
    await expect(wallet.switchNetwork(-1)).rejects.toThrow("不支持的网络");
  });
});
