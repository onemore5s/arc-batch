import { createAppKit } from "@reown/appkit";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { getAccount } from "@wagmi/core";
import { http } from "viem";
import { NETWORKS, REOWN, SETTINGS, type NetworkName } from "./config";
import { ReownWallet } from "./chain/reown-wallet";
import type { WalletRuntime } from "./wallet-runtime";

export async function createReownConnection(
  projectId: string,
  origin: string,
  defaultNetwork: NetworkName = SETTINGS.defaultNetwork,
): Promise<WalletRuntime> {
  const networks = [NETWORKS.testnet, NETWORKS.mainnet] as [
    typeof NETWORKS.testnet,
    typeof NETWORKS.mainnet,
  ];
  const customRpcUrls = Object.fromEntries(
    networks.map((chain) => [
      `eip155:${chain.id}` as const,
      [{ url: chain.rpcUrls.default.http[0] }],
    ]),
  );
  const adapter = new WagmiAdapter({
    projectId,
    networks,
    customRpcUrls,
    transports: Object.fromEntries(
      networks.map((chain) => [chain.id, http(chain.rpcUrls.default.http[0])]),
    ),
  });
  const style = getComputedStyle(document.documentElement);
  const modal = createAppKit({
    adapters: [adapter],
    projectId,
    networks,
    customRpcUrls,
    defaultNetwork: NETWORKS[defaultNetwork],
    metadata: {
      name: SETTINGS.brand,
      description: REOWN.description,
      url: origin,
      icons: [new URL(REOWN.iconPath, origin).href],
    },
    themeMode: "light",
    themeVariables: {
      "--apkt-accent": style.getPropertyValue("--arc-protocol-navy").trim(),
      "--apkt-color-mix": style.getPropertyValue("--arc-sky-sync").trim(),
      "--apkt-color-mix-strength": REOWN.themeMixStrength,
      "--apkt-font-family": style.fontFamily,
      "--apkt-z-index": REOWN.modalZIndex,
    },
    enableReconnect: true,
    enableWalletConnect: true,
    enableEIP6963: true,
    enableInjected: true,
    enableCoinbase: false,
    enableBaseAccount: false,
    allowUnsupportedChain: true,
    allWallets: "SHOW",
    defaultAccountTypes: { eip155: "eoa" },
    features: {
      email: false,
      socials: [],
      analytics: false,
      swaps: false,
      onramp: false,
      history: false,
      send: false,
      receive: false,
    },
  });
  return {
    wallets: [new ReownWallet(adapter.wagmiConfig)],
    async openWallet() {
      await modal.open({
        view: getAccount(adapter.wagmiConfig).isConnected
          ? "Account"
          : "Connect",
        namespace: "eip155",
      });
    },
  };
}
