import {
  getAccount,
  watchAccount,
  switchChain,
  type Config,
} from "@wagmi/core";
import {
  InjectedWallet,
  chainForId,
  type ConnectedWallet,
  type Provider,
} from "./adapters";
import type { WalletContext } from "./types";
import type { Preflight, Snapshot } from "../domain/types";
import { REOWN } from "../config";

/** Adapt the active AppKit connection; verify the actual wallet account and chain before signing. */
export class ReownWallet implements ConnectedWallet {
  readonly name = REOWN.walletName;
  constructor(private config: Config) {}

  private async activeWallet() {
    const account = getAccount(this.config);
    if (!account.isConnected || !account.connector)
      throw new Error("钱包尚未连接");
    const assertCurrent = () => {
      const current = getAccount(this.config);
      if (
        !current.isConnected ||
        current.connector?.uid !== account.connector!.uid ||
        current.address !== account.address ||
        current.chainId !== account.chainId
      )
        throw new Error("钱包连接已改变，请重新复核");
    };
    const provider = (await account.connector.getProvider()) as
      Provider | undefined;
    if (!provider || typeof provider.request !== "function")
      throw new Error("钱包连接不可用，请重新连接");
    assertCurrent();
    return new InjectedWallet(account.connector.name, {
      request: (args) => {
        assertCurrent();
        return provider.request(args);
      },
    });
  }

  async context() {
    return (await this.activeWallet()).context();
  }
  async connect() {
    return this.context();
  }
  async switchNetwork(chainId: number) {
    chainForId(chainId);
    await switchChain(this.config, { chainId });
  }
  async send(snapshot: Snapshot, preflight: Preflight) {
    return (await this.activeWallet()).send(snapshot, preflight);
  }
  subscribe(listener: (context: WalletContext | undefined) => void) {
    let generation = 0;
    let live = true;
    const update = () => {
      if (!live) return;
      const current = ++generation;
      // Invalidate preflight first; stale reads must not overwrite a new account or disconnection.
      listener(undefined);
      if (!getAccount(this.config).isConnected) return;
      void this.context().then(
        (context) => {
          if (live && current === generation) listener(context);
        },
        () => {
          if (live && current === generation) listener(undefined);
        },
      );
    };
    const stop = watchAccount(this.config, { onChange: update });
    update();
    return () => {
      live = false;
      stop();
    };
  }
}
