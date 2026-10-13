import type { Address, Hex } from "viem";
import type {
  Snapshot,
  Preflight,
  Replacement,
  Deployment,
} from "../domain/types";
export interface ChainLog {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
  transactionHash?: Hex | null;
  removed?: boolean;
}
export interface ChainTransaction {
  hash: Hex;
  from: Address;
  to: Address | null;
  input: Hex;
  value: bigint;
  nonce: number;
}
export interface ChainReceipt {
  transactionHash: Hex;
  from: Address;
  to: Address | null;
  status: "success" | "reverted";
  blockNumber: bigint;
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  logs: ChainLog[];
}
export interface Gateway {
  deployment?: Deployment;
  chainId(): Promise<number>;
  code(address: Address): Promise<Hex>;
  version(address: Address): Promise<string>;
  maxRecipients(address: Address): Promise<bigint>;
  executed(snapshot: Snapshot): Promise<boolean>;
  balance(address: Address): Promise<bigint>;
  simulate(snapshot: Snapshot): Promise<void>;
  estimateGas(snapshot: Snapshot): Promise<bigint>;
  fees(): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;
  block(): Promise<bigint>;
  transaction(hash: Hex): Promise<ChainTransaction>;
  receipt(hash: Hex): Promise<ChainReceipt>;
  logs(snapshot: Snapshot, from: bigint, to: bigint): Promise<ChainLog[]>;
  wait(hash: Hex, replacement: (r: Replacement) => void): Promise<ChainReceipt>;
}
export interface WalletContext {
  payer: Address;
  chainId: number;
}
export interface WalletAdapter {
  context(): Promise<WalletContext>;
  send(snapshot: Snapshot, preflight: Preflight): Promise<Hex>;
}
