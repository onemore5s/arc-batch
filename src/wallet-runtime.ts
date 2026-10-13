import type { ConnectedWallet } from "./chain/adapters";
import { REOWN, SETTINGS, type NetworkName } from "./config";

export interface WalletRuntime {
  wallets: ConnectedWallet[];
  openWallet?(): Promise<void>;
  walletNotice?: string;
}
interface WalletOptions {
  wallets: ConnectedWallet[];
  projectId?: string;
  origin: string;
  defaultNetwork?: NetworkName;
}
export async function configureWallets(
  {
    wallets,
    projectId,
    origin,
    defaultNetwork = SETTINGS.defaultNetwork,
  }: WalletOptions,
  load: () => Promise<{
    createReownConnection(
      projectId: string,
      origin: string,
      defaultNetwork: NetworkName,
    ): Promise<WalletRuntime>;
  }> = () => import("./reown"),
): Promise<WalletRuntime> {
  const fallback = { wallets, walletNotice: REOWN.fallbackNotice };
  if (!projectId || !REOWN.projectIdPattern.test(projectId)) return fallback;
  try {
    const { createReownConnection } = await load();
    return await createReownConnection(projectId, origin, defaultNetwork);
  } catch (error) {
    console.warn(REOWN.loadError, error);
    return fallback;
  }
}
