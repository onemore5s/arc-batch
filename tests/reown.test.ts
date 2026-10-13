import { describe, expect, it, vi } from "vitest";
import { createReownConnection } from "../src/reown";
import { NETWORKS, SETTINGS } from "../src/config";

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  adapter: vi.fn(),
  open: vi.fn(async () => {}),
  connected: false,
}));
vi.mock("@reown/appkit", () => ({ createAppKit: sdk.create }));
vi.mock("@reown/appkit-adapter-wagmi", () => ({
  WagmiAdapter: class {
    wagmiConfig = {};
    constructor(options: unknown) {
      sdk.adapter(options);
    }
  },
}));
vi.mock("@wagmi/core", () => ({
  getAccount: () => ({ isConnected: sdk.connected }),
}));

describe("Reown external wallet configuration", () => {
  it("opens on mainnet when the deployment targets mainnet", async () => {
    sdk.create.mockReturnValue({ open: sdk.open });
    await createReownConnection(
      "a".repeat(32),
      "https://arc-batch.example",
      "mainnet",
    );
    expect(sdk.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultNetwork: NETWORKS.mainnet }),
    );
  });
  it("uses explicit Arc RPCs and theme while disabling unrelated wallet services", async () => {
    sdk.create.mockReturnValue({ open: sdk.open });
    const projectId = "a".repeat(32),
      origin = "https://arc-batch.example";
    const result = await createReownConnection(projectId, origin);
    expect(result.wallets).toHaveLength(1);
    expect(sdk.adapter).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        networks: [NETWORKS[SETTINGS.defaultNetwork], NETWORKS.mainnet],
        transports: expect.objectContaining({
          [NETWORKS.testnet.id]: expect.any(Function),
          [NETWORKS.mainnet.id]: expect.any(Function),
        }),
      }),
    );
    expect(sdk.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        themeMode: "light",
        enableReconnect: true,
        metadata: expect.objectContaining({
          name: SETTINGS.brand,
          url: origin,
        }),
        features: expect.objectContaining({
          email: false,
          socials: [],
          swaps: false,
          onramp: false,
          analytics: false,
        }),
      }),
    );
    sdk.connected = false;
    await result.openWallet!();
    expect(sdk.open).toHaveBeenLastCalledWith({
      view: "Connect",
      namespace: "eip155",
    });
    sdk.connected = true;
    await result.openWallet!();
    expect(sdk.open).toHaveBeenLastCalledWith({
      view: "Account",
      namespace: "eip155",
    });
  });
});
