import { defineChain } from "viem";
export const PROTOCOL = {
  nativeDecimals: 18,
  rewardDecimals: 6,
  version: "1.0.0",
  schemaVersion: 1,
} as const;
export const COMPILATION = {
  optimizerRuns: 200,
  evmVersion: "paris",
  acceptedDeploymentEvmVersions: ["paris", "prague"],
} as const;
export const AMOUNT_STEP =
  10n ** BigInt(PROTOCOL.nativeDecimals - PROTOCOL.rewardDecimals);
export const UINT256_MAX = (1n << 256n) - 1n;
export const ZERO_BATCH = `0x${"0".repeat(64)}`;
export const SETTINGS = {
  brand: "ArcBatch",
  logoPath: "/arc-batch.svg",
  maxFileBytes: 2 * 1024 * 1024,
  maxTextLength: 512,
  pollMs: 4000,
  receiptTimeoutMs: 120000,
  rpcTimeoutMs: 15000,
  logWindow: 1000n,
  gasNumerator: 125n,
  gasDenominator: 100n,
  storageName: "arc-batch",
  storageVersion: 1,
  channel: "arc-batch-changes",
  defaultNetwork: "testnet",
  devPort: 5173,
  walletDiscoveryMs: 300,
  selectTypeaheadMs: 700,
  copyFeedbackMs: 1600,
} as const;
export const ROSTER_CSV = {
  fileName: `${SETTINGS.brand}-recipients-template.csv`,
  columns: ["address", "amount", "label"],
  placeholders: ["<recipient_address>", "<amount_usdc>", "<optional_label>"],
} as const;
// Source: https://docs.arc.io/arc/references/connect-to-arc. Verify eth_chainId on connection.
export const NETWORKS = {
  mainnet: defineChain({
    id: 5042,
    name: "Arc Mainnet",
    nativeCurrency: {
      name: "USDC",
      symbol: "USDC",
      decimals: PROTOCOL.nativeDecimals,
    },
    rpcUrls: { default: { http: ["https://rpc.mainnet.arc.io"] } },
    blockExplorers: {
      default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
    },
  }),
  testnet: defineChain({
    id: 5042002,
    name: "Arc Testnet",
    nativeCurrency: {
      name: "USDC",
      symbol: "USDC",
      decimals: PROTOCOL.nativeDecimals,
    },
    rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
    blockExplorers: {
      default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" },
    },
    testnet: true,
  }),
} as const;
export type NetworkName = keyof typeof NETWORKS;
export const ATTEMPT_ERROR_CLASSES = [
  "signature_rejected",
  "uncertain",
  "reverted",
  "cancelled",
  "verification",
] as const;
export const ATTEMPT_ERROR_MESSAGES = {
  signature_rejected: "已取消这次钱包签名。",
  uncertain: "这次钱包或网络请求未完成，交易结果需核验。",
  reverted: "这次交易已回滚，奖励未发放；仍可能产生手续费。",
  cancelled: "这次交易已被取消。",
  verification: "这次交易尚未通过完整核验。",
} satisfies Record<(typeof ATTEMPT_ERROR_CLASSES)[number], string>;
export const STATUS_LABELS = {
  draft: "草稿",
  ready: "待复核",
  awaiting_signature: "等待钱包确认",
  pending: "待链上确认",
  confirmed: "已核验发放",
  reverted: "交易回滚",
  cancelled: "交易取消",
  unknown: "结果待核验",
} as const;
export const RECIPIENT_STATUS_LABELS = {
  draft: "待检查",
  ready: "待付款",
  awaiting_signature: "待签名",
  pending: "确认中",
  confirmed: "已发放",
  reverted: "未发放",
  cancelled: "已取消",
  unknown: "待核验",
} satisfies Record<keyof typeof STATUS_LABELS, string>;
export const WALLET_UI = {
  fallbackName: "浏览器钱包",
  iconDataPrefix: "data:image/",
  rejectedCode: 4001,
  pendingRequestCode: -32002,
  rejectedMessage: "已取消连接，可以重新选择钱包。",
  pendingMessage: "钱包中已有待处理的连接请求，请打开钱包继续。",
  failedMessage: "连接未完成，请检查钱包是否已解锁后重试。",
} as const;
export const REOWN = {
  walletName: "AppKit 钱包",
  projectIdPattern: /^[a-f\d]{32}$/i,
  description: "Arc 原生 USDC 批量奖励发放",
  iconPath: SETTINGS.logoPath,
  themeMixStrength: 6,
  modalZIndex: 50,
  fallbackNotice: "扫码连接暂不可用，请使用浏览器钱包。",
  loadError: "钱包连接组件暂时无法打开，请稍后重试。",
} as const;
