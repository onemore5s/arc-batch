import type { Address, Hex } from "viem";
import type { ATTEMPT_ERROR_CLASSES, STATUS_LABELS } from "../config";
export type BatchStatus = keyof typeof STATUS_LABELS;
export interface InputRow {
  sourceRow: number;
  address: string;
  amount: string;
  label: string;
}
export interface RewardRow {
  sourceRow: number;
  address: Address;
  amount: string;
  amountNative: string;
  recipientIndex: number;
  label: string;
}
export interface Snapshot {
  payer: Address;
  chainId: number;
  contractAddress: Address;
  batchId: Hex;
  recipients: RewardRow[];
  payloadHash: Hex;
  totalNative: string;
}
export interface Replacement {
  oldHash: Hex;
  newHash: Hex;
  reason: "repriced" | "replaced" | "cancelled";
}
export interface TxAttempt {
  id: string;
  requestedAt: string;
  originalHash?: Hex;
  currentHash?: Hex;
  nonce?: number;
  replacements: Replacement[];
  receipt?: Evidence & { status: "success" | "reverted" };
  errorClass?: (typeof ATTEMPT_ERROR_CLASSES)[number];
  error?: string;
}
export interface Evidence {
  transactionHash: Hex;
  blockNumber: string;
  gasUsed: string;
  effectiveGasPrice: string;
}
export interface BatchRecord {
  schemaVersion: 1;
  localId: string;
  activityName: string;
  createdAt: string;
  status: BatchStatus;
  snapshot: Snapshot;
  attempts: TxAttempt[];
  preflightBlock?: string;
  evidence?: Evidence;
}
export interface Deployment {
  chainId: number;
  contractAddress: Address;
  deploymentBlock: string;
  transactionHash: Hex;
  maxRecipients: string;
  version: string;
  compiler: string;
  evmVersion: string;
  sourceHash: Hex;
  runtimeCodeHash: Hex;
  abiSource: string;
}
export interface Preflight {
  gasLimit: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  estimatedFee: bigint;
  requiredBalance: bigint;
  balance: bigint;
  block: bigint;
}
