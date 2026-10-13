import { describe, expect, it, vi } from "vitest";
import { configureWallets } from "../src/wallet-runtime";
import { REOWN, SETTINGS } from "../src/config";
import type { ConnectedWallet } from "../src/chain/adapters";

const fixtures = {
  projectId: "a".repeat(32),
  origin: "https://arc-batch.example",
  wallets: [{ name: "浏览器测试钱包" }] as ConnectedWallet[],
};
describe("Wallet runtime initialization", () => {
  it.each([undefined, "", "<Reown Project ID>", "invalid"])(
    "retains browser wallets and explains unavailable QR connection for invalid ID: %s",
    async (projectId) => {
      const load = vi.fn();
      const result = await configureWallets({ ...fixtures, projectId }, load);
      expect(load).not.toHaveBeenCalled();
      expect(result).toEqual({
        wallets: fixtures.wallets,
        walletNotice: REOWN.fallbackNotice,
      });
    },
  );
  it("loads AppKit on demand for a valid project ID", async () => {
    const connection = { wallets: fixtures.wallets, openWallet: vi.fn() };
    const initialize = vi.fn(async () => connection);
    const load = vi.fn(async () => ({ createReownConnection: initialize }));
    expect(await configureWallets(fixtures, load)).toBe(connection);
    expect(initialize).toHaveBeenCalledWith(
      fixtures.projectId,
      fixtures.origin,
      SETTINGS.defaultNetwork,
    );
  });
  it("passes the deployment network to AppKit initialization", async () => {
    const initialize = vi.fn(async () => ({ wallets: fixtures.wallets }));
    await configureWallets(
      { ...fixtures, defaultNetwork: "mainnet" },
      async () => ({ createReownConnection: initialize }),
    );
    expect(initialize).toHaveBeenCalledWith(
      fixtures.projectId,
      fixtures.origin,
      "mainnet",
    );
  });
  it("preserves editing and injected wallets when AppKit fails", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = vi.fn().mockRejectedValue(new Error("加载失败"));
    expect(await configureWallets(fixtures, load)).toEqual({
      wallets: fixtures.wallets,
      walletNotice: REOWN.fallbackNotice,
    });
    expect(warning).toHaveBeenCalledWith(REOWN.loadError, expect.any(Error));
    warning.mockRestore();
  });
});
