import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  getAbiItem,
  keccak256,
  decodeFunctionData,
  type Address,
  type Chain,
  type Hex,
  type EIP1193Provider,
} from "viem";
import {
  NETWORKS,
  SETTINGS,
  PROTOCOL,
  WALLET_UI,
  type NetworkName,
} from "../config";
import { distributorAbi } from "../generated/abi";
import { distributeData, verifyReceipt } from "./service";
import { queryFees } from "./fees";
import { deploymentSchema } from "../domain/schema";
import { makeSnapshot, createRecord } from "../domain/batch";
import { formatNative } from "../domain/amount";
import { checkFileSize } from "../domain/recipients";
import { normalizeAddress } from "../domain/address";
import type {
  BatchRecord,
  Deployment,
  Preflight,
  Snapshot,
  Replacement,
} from "../domain/types";
import type { Gateway, WalletAdapter, WalletContext } from "./types";
export function chainForId(chainId: number): Chain {
  const chain = Object.values(NETWORKS).find((c) => c.id === chainId);
  if (!chain) throw new Error("不支持的网络");
  return chain;
}
export class RpcGateway implements Gateway {
  readonly client;
  constructor(
    chainId: number,
    public deployment?: Deployment,
    rpcUrl?: string,
  ) {
    const chain = chainForId(chainId);
    this.client = createPublicClient({
      chain,
      transport: http(rpcUrl, {
        timeout: SETTINGS.rpcTimeoutMs,
        retryCount: 1,
      }),
    });
  }
  async chainId() {
    return this.client.getChainId();
  }
  async code(address: Address) {
    return (await this.client.getCode({ address })) ?? "0x";
  }
  async version(address: Address) {
    return this.client.readContract({
      address,
      abi: distributorAbi,
      functionName: "version",
    });
  }
  async maxRecipients(address: Address) {
    return this.client.readContract({
      address,
      abi: distributorAbi,
      functionName: "maxRecipients",
    });
  }
  async executed(s: Snapshot) {
    return this.client.readContract({
      address: s.contractAddress,
      abi: distributorAbi,
      functionName: "executed",
      args: [s.payer, s.batchId],
    });
  }
  async balance(address: Address) {
    return this.client.getBalance({ address });
  }
  async simulate(s: Snapshot) {
    await this.client.call({
      account: s.payer,
      to: s.contractAddress,
      data: distributeData(s),
      value: BigInt(s.totalNative),
    });
  }
  async estimateGas(s: Snapshot) {
    return this.client.estimateGas({
      account: s.payer,
      to: s.contractAddress,
      data: distributeData(s),
      value: BigInt(s.totalNative),
    });
  }
  async fees() {
    return queryFees(this.client);
  }
  async block() {
    return this.client.getBlockNumber();
  }
  async transaction(hash: Hex) {
    return this.client.getTransaction({ hash });
  }
  async receipt(hash: Hex) {
    return this.client.getTransactionReceipt({ hash });
  }
  async logs(s: Snapshot, from: bigint, to: bigint) {
    return this.client.getLogs({
      address: s.contractAddress,
      event: getAbiItem({ abi: distributorAbi, name: "BatchPaid" }),
      args: { payer: s.payer, batchId: s.batchId },
      fromBlock: from,
      toBlock: to,
      strict: true,
    });
  }
  async wait(hash: Hex, replacement: (r: Replacement) => void) {
    return this.client.waitForTransactionReceipt({
      hash,
      timeout: SETTINGS.receiptTimeoutMs,
      pollingInterval: SETTINGS.pollMs,
      onReplaced: ({ reason, replacedTransaction, transaction }) =>
        replacement({
          reason,
          oldHash: replacedTransaction.hash,
          newHash: transaction.hash,
        }),
    });
  }
}
export interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: () => void): void;
  removeListener?(event: string, listener: () => void): void;
}
export interface ConnectedWallet extends WalletAdapter {
  name: string;
  icon?: string;
  connect(): Promise<WalletContext>;
  switchNetwork(chainId: number): Promise<void>;
  subscribe(listener: (context: WalletContext | undefined) => void): () => void;
}
export class InjectedWallet implements ConnectedWallet {
  constructor(
    public name: string,
    private provider: Provider,
    public icon?: string,
  ) {}
  async context(): Promise<WalletContext> {
    const [accounts, chain] = await Promise.all([
      this.provider.request({ method: "eth_accounts" }),
      this.provider.request({ method: "eth_chainId" }),
    ]);
    if (
      !Array.isArray(accounts) ||
      typeof accounts[0] !== "string" ||
      typeof chain !== "string" ||
      !/^0x[\da-f]+$/i.test(chain)
    )
      throw new Error("钱包已断开或返回无效网络");
    const chainId = Number(BigInt(chain));
    if (!Number.isSafeInteger(chainId)) throw new Error("钱包网络无效");
    return { payer: normalizeAddress(accounts[0]), chainId };
  }
  async connect() {
    await this.provider.request({ method: "eth_requestAccounts" });
    return this.context();
  }
  async switchNetwork(chainId: number) {
    const chain = chainForId(chainId);
    try {
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== 4902
      )
        throw error;
      await this.provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${chainId.toString(16)}`,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [...chain.rpcUrls.default.http],
            blockExplorerUrls: [chain.blockExplorers!.default.url],
          },
        ],
      });
      await this.provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${chainId.toString(16)}` }],
      });
    }
  }
  subscribe(listener: (context: WalletContext | undefined) => void) {
    const changed = () => {
      void this.context().then(listener, () => listener(undefined));
    };
    for (const event of ["accountsChanged", "chainChanged", "disconnect"])
      this.provider.on?.(event, changed);
    return () => {
      for (const event of ["accountsChanged", "chainChanged", "disconnect"])
        this.provider.removeListener?.(event, changed);
    };
  }
  async send(s: Snapshot, p: Preflight) {
    const chain = chainForId(s.chainId),
      context = await this.context();
    if (
      context.chainId !== s.chainId ||
      context.payer.toLowerCase() !== s.payer.toLowerCase()
    )
      throw new Error("钱包或网络已改变");
    const client = createWalletClient({
      chain,
      transport: custom(this.provider as EIP1193Provider),
    });
    return client.sendTransaction({
      account: s.payer,
      to: s.contractAddress,
      value: BigInt(s.totalNative),
      data: distributeData(s),
      gas: p.gasLimit,
      maxFeePerGas: p.maxFeePerGas,
      maxPriorityFeePerGas: p.maxPriorityFeePerGas,
    });
  }
}
export async function discoverWallets(): Promise<ConnectedWallet[]> {
  const wallets: ConnectedWallet[] = [],
    seen = new Set<Provider>();
  const announced = (event: Event) => {
    const detail = (
      event as CustomEvent<{
        info: { name: string; icon?: string };
        provider: Provider;
      }>
    ).detail;
    if (detail?.provider && !seen.has(detail.provider)) {
      seen.add(detail.provider);
      wallets.push(
        new InjectedWallet(detail.info.name, detail.provider, detail.info.icon),
      );
    }
  };
  window.addEventListener("eip6963:announceProvider", announced);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) =>
    setTimeout(resolve, SETTINGS.walletDiscoveryMs),
  );
  window.removeEventListener("eip6963:announceProvider", announced);
  const fallback = (window as Window & { ethereum?: Provider }).ethereum;
  if (fallback && !seen.has(fallback))
    wallets.push(new InjectedWallet(WALLET_UI.fallbackName, fallback));
  return wallets;
}
export async function loadDeployment(
  file: string | undefined,
): Promise<Deployment[]> {
  if (!file) return [];
  if (!/^[\w.-]+\.json$/.test(file) || file.includes(".."))
    throw new Error("部署清单文件名无效");
  const response = await fetch(`/deployments/${file}`, { cache: "no-store" });
  if (!response.ok) throw new Error("部署清单加载失败");
  const text = await response.text();
  checkFileSize(text);
  return [deploymentSchema.parse(JSON.parse(text)) as Deployment];
}
export function deploymentNetwork(deployments: Deployment[]): NetworkName {
  return (
    (Object.keys(NETWORKS) as NetworkName[]).find(
      (name) => NETWORKS[name].id === deployments[0]?.chainId,
    ) ?? SETTINGS.defaultNetwork
  );
}
export async function validateDeployment(
  deployment: Deployment,
  gateway: Gateway,
) {
  deploymentSchema.parse(deployment);
  if ((await gateway.chainId()) !== deployment.chainId)
    throw new Error("部署清单与 RPC 网络不匹配");
  const code = await gateway.code(deployment.contractAddress);
  if (code === "0x" || keccak256(code) !== deployment.runtimeCodeHash)
    throw new Error("合约代码与部署清单不匹配");
  if (
    deployment.version !== PROTOCOL.version ||
    (await gateway.version(deployment.contractAddress)) !== deployment.version
  )
    throw new Error("合约版本不匹配");
  if (
    (await gateway.maxRecipients(deployment.contractAddress)) !==
    BigInt(deployment.maxRecipients)
  )
    throw new Error("合约人数上限与部署清单不匹配");
  return deployment;
}
export async function restoreTransaction(
  hash: Hex,
  deployment: Deployment,
  g: Gateway,
): Promise<BatchRecord> {
  if (!/^0x[\da-f]{64}$/i.test(hash))
    throw new Error("交易哈希须为 32 字节十六进制");
  if ((await g.chainId()) !== deployment.chainId)
    throw new Error("核验网络不匹配");
  const tx = await g.transaction(hash);
  if (tx.to?.toLowerCase() !== deployment.contractAddress.toLowerCase())
    throw new Error("交易不是发给当前发奖合约");
  const decoded = decodeFunctionData({ abi: distributorAbi, data: tx.input });
  if (decoded.functionName !== "distribute")
    throw new Error("交易不是批量发奖调用");
  const [batchId, addresses, amounts] = decoded.args;
  if (addresses.length !== amounts.length) throw new Error("交易名单长度不符");
  const snapshot = makeSnapshot({
    payer: tx.from,
    chainId: deployment.chainId,
    contractAddress: deployment.contractAddress,
    batchId,
    recipients: addresses.map((address, i) => ({
      address,
      amount: formatNative(amounts[i]),
      amountNative: amounts[i].toString(),
      sourceRow: i + 1,
      recipientIndex: i,
      label: "",
    })),
  });
  const record = createRecord(snapshot, "");
  record.preflightBlock = deployment.deploymentBlock;
  record.attempts = [
    {
      id: crypto.randomUUID(),
      requestedAt: new Date().toISOString(),
      originalHash: hash,
      currentHash: hash,
      nonce: tx.nonce,
      replacements: [],
    },
  ];
  try {
    return {
      ...record,
      ...verifyReceipt(snapshot, tx, await g.receipt(hash), deployment.chainId),
    };
  } catch {
    return { ...record, status: "unknown" };
  }
}
