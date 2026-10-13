import { decodeEventLog, encodeFunctionData, keccak256, type Hex } from "viem";
import { distributorAbi } from "../generated/abi";
import { PROTOCOL, SETTINGS } from "../config";
import { makeSnapshot, transition, recordKey } from "../domain/batch";
import type {
  Snapshot,
  BatchRecord,
  Preflight,
  Evidence,
} from "../domain/types";
import type {
  ChainTransaction,
  ChainReceipt,
  WalletContext,
  Gateway,
  WalletAdapter,
} from "./types";
import type { RecordStore } from "../storage";
const equal = (a: string | null | undefined, b: string) =>
  a?.toLowerCase() === b.toLowerCase();
export function distributeData(s: Snapshot) {
  return encodeFunctionData({
    abi: distributorAbi,
    functionName: "distribute",
    args: [
      s.batchId,
      s.recipients.map((r) => r.address),
      s.recipients.map((r) => BigInt(r.amountNative)),
    ],
  });
}
export function verifyReceipt(
  s: Snapshot,
  t: ChainTransaction,
  r: ChainReceipt,
  chainId: number,
): { status: "confirmed" | "unknown" | "reverted"; evidence?: Evidence } {
  const unknown = { status: "unknown" } as const;
  try {
    const checked = makeSnapshot(s);
    if (
      checked.payloadHash !== s.payloadHash ||
      checked.totalNative !== s.totalNative ||
      chainId !== s.chainId ||
      !equal(t.to, s.contractAddress) ||
      !equal(t.from, s.payer) ||
      !equal(r.to, s.contractAddress) ||
      !equal(r.from, s.payer) ||
      !equal(r.transactionHash, t.hash) ||
      t.value !== BigInt(s.totalNative) ||
      !equal(t.input, distributeData(s))
    )
      return unknown;
    if (r.status === "reverted") return { status: "reverted" };
    const logs = r.logs.filter((l) => equal(l.address, s.contractAddress));
    if (
      logs.some(
        (l) =>
          l.removed || (l.transactionHash && !equal(l.transactionHash, t.hash)),
      )
    )
      return unknown;
    const events = logs.map((l) =>
      decodeEventLog({
        abi: distributorAbi,
        data: l.data,
        topics: l.topics as [Hex, ...Hex[]],
        strict: true,
      }),
    );
    const batches = events.filter((e) => e.eventName === "BatchPaid"),
      rewards = events.filter((e) => e.eventName === "RewardPaid");
    if (batches.length !== 1 || rewards.length !== s.recipients.length)
      return unknown;
    const batch = batches[0].args;
    if (
      !equal(batch.payer, s.payer) ||
      !equal(batch.batchId, s.batchId) ||
      !equal(batch.payloadHash, s.payloadHash) ||
      batch.recipientCount !== BigInt(s.recipients.length) ||
      batch.totalAmount !== BigInt(s.totalNative)
    )
      return unknown;
    const indices = new Set<bigint>();
    for (const event of rewards) {
      const a = event.args,
        index = a.recipientIndex;
      if (index >= BigInt(s.recipients.length) || indices.has(index))
        return unknown;
      indices.add(index);
      const row = s.recipients[Number(index)];
      if (
        !equal(a.payer, s.payer) ||
        !equal(a.batchId, s.batchId) ||
        !equal(a.recipient, row.address) ||
        a.amount !== BigInt(row.amountNative)
      )
        return unknown;
    }
    return {
      status: "confirmed",
      evidence: {
        transactionHash: r.transactionHash,
        blockNumber: r.blockNumber.toString(),
        gasUsed: r.gasUsed.toString(),
        effectiveGasPrice: r.effectiveGasPrice.toString(),
      },
    };
  } catch {
    return unknown;
  }
}
export async function preflight(
  s: Snapshot,
  c: WalletContext,
  g: Gateway,
): Promise<Preflight> {
  const checked = makeSnapshot(s);
  if (
    checked.payloadHash !== s.payloadHash ||
    checked.totalNative !== s.totalNative
  )
    throw new Error("冻结快照摘要不匹配");
  if (!equal(c.payer, s.payer) || c.chainId !== s.chainId)
    throw new Error("钱包或网络已改变，请重新复核");
  if ((await g.chainId()) !== s.chainId)
    throw new Error("RPC 网络与目标网络不匹配");
  const code = await g.code(s.contractAddress);
  if (code === "0x") throw new Error("合约地址没有代码");
  if (
    g.deployment &&
    (!equal(g.deployment.contractAddress, s.contractAddress) ||
      g.deployment.chainId !== s.chainId ||
      keccak256(code) !== g.deployment.runtimeCodeHash)
  )
    throw new Error("合约代码与部署清单不匹配");
  if ((await g.version(s.contractAddress)) !== PROTOCOL.version)
    throw new Error("合约版本不匹配");
  const maximum = await g.maxRecipients(s.contractAddress);
  if (
    maximum <= 0n ||
    BigInt(s.recipients.length) > maximum ||
    (g.deployment && maximum !== BigInt(g.deployment.maxRecipients))
  )
    throw new Error("人数超过合约上限或部署参数不匹配");
  if (await g.executed(s))
    throw new Error("该批次已经执行，请继续核验，禁止重新付款");
  await g.simulate(s);
  const [estimate, fees, balance, block] = await Promise.all([
    g.estimateGas(s),
    g.fees(),
    g.balance(s.payer),
    g.block(),
  ]);
  if (
    estimate <= 0n ||
    fees.maxFeePerGas <= 0n ||
    fees.maxPriorityFeePerGas < 0n ||
    fees.maxPriorityFeePerGas > fees.maxFeePerGas
  )
    throw new Error("RPC 返回的手续费参数无效");
  const gasLimit =
    (estimate * SETTINGS.gasNumerator + SETTINGS.gasDenominator - 1n) /
    SETTINGS.gasDenominator;
  const requiredBalance = BigInt(s.totalNative) + gasLimit * fees.maxFeePerGas;
  if (balance < requiredBalance)
    throw new Error("余额不足：需要奖励总额加保守 gas 准备额度");
  return {
    gasLimit,
    ...fees,
    balance,
    block,
    requiredBalance,
    estimatedFee: estimate * fees.maxFeePerGas,
  };
}
export async function recoverBatch(
  record: BatchRecord,
  g: Gateway,
): Promise<BatchRecord> {
  record = structuredClone(record);
  const s = record.snapshot;
  if ((await g.chainId()) !== s.chainId)
    throw new Error("恢复查询的 RPC 网络不匹配");
  const hashes = new Set<Hex>();
  if (record.evidence) hashes.add(record.evidence.transactionHash);
  for (const a of record.attempts) {
    if (a.currentHash) hashes.add(a.currentHash);
    if (a.originalHash) hashes.add(a.originalHash);
  }
  const executed = await g.executed(s);
  if (executed) {
    const start = record.preflightBlock ?? g.deployment?.deploymentBlock;
    if (start !== undefined) {
      const end = await g.block();
      for (let from = BigInt(start); from <= end; from += SETTINGS.logWindow) {
        const to = from + SETTINGS.logWindow - 1n;
        for (const log of await g.logs(s, from, to > end ? end : to))
          if (log.transactionHash) hashes.add(log.transactionHash);
      }
    }
  }
  let reverted = false,
    cancelled = false;
  const active = record.attempts.at(-1);
  for (const h of hashes) {
    try {
      const [tx, receipt] = await Promise.all([g.transaction(h), g.receipt(h)]);
      const verified = verifyReceipt(s, tx, receipt, s.chainId);
      const attempt = record.attempts.find(
        (a) => a.currentHash === h || a.originalHash === h,
      );
      if (attempt && equal(receipt.transactionHash, h) && equal(tx.hash, h)) {
        // Receipt summaries retain fee evidence; only full onchain verification can confirm a payment.
        attempt.receipt = {
          transactionHash: h,
          blockNumber: receipt.blockNumber.toString(),
          gasUsed: receipt.gasUsed.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice.toString(),
          status: receipt.status,
        };
        if (verified.status === "unknown") attempt.errorClass = "verification";
      }
      if (verified.status === "confirmed") return { ...record, ...verified };
      if (verified.status === "reverted" && equal(active?.currentHash, h)) {
        reverted = true;
        active!.errorClass = "reverted";
      }
      if (
        verified.status === "unknown" &&
        equal(active?.currentHash, h) &&
        active?.replacements.some(
          (r) => r.reason === "cancelled" || r.reason === "replaced",
        ) &&
        receipt.status === "success" &&
        equal(receipt.transactionHash, tx.hash) &&
        equal(tx.from, s.payer) &&
        equal(receipt.from, s.payer)
      ) {
        cancelled = true;
        active!.errorClass = "cancelled";
      }
    } catch {
      /* A missing receipt leaves the result unknown; it does not prove that broadcasting never happened. */
    }
  }
  if (executed) return { ...record, status: "unknown", evidence: undefined };
  return {
    ...record,
    status: reverted ? "reverted" : cancelled ? "cancelled" : "unknown",
    evidence: undefined,
  };
}
function rejected(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (("code" in error && error.code === 4001) ||
      ("cause" in error && rejected(error.cause)))
  );
}
export async function submitBatch(
  record: BatchRecord,
  store: RecordStore,
  g: Gateway,
  w: WalletAdapter,
  progress?: (record: BatchRecord) => void,
): Promise<BatchRecord> {
  const run = async () => {
    const latest = await store.get(record.snapshot);
    if (latest && latest.status !== "ready")
      throw new Error("该批次正在处理或需要先核验结果");
    const frozen = structuredClone(latest ?? record);
    const checked = await preflight(frozen.snapshot, await w.context(), g);
    frozen.preflightBlock = checked.block.toString();
    const attempt = {
      id: crypto.randomUUID(),
      requestedAt: new Date().toISOString(),
      replacements: [],
    } as BatchRecord["attempts"][number];
    frozen.attempts.push(attempt);
    // Claim atomically after preflight and persist the attempt so a slow tab cannot overwrite another tab.
    let current = await store.claim(frozen);
    progress?.(structuredClone(current));
    try {
      // Read wallet context again before requesting a signature in case it changed during preflight.
      const context = await w.context();
      if (
        context.chainId !== frozen.snapshot.chainId ||
        !equal(context.payer, frozen.snapshot.payer)
      ) {
        current.status = "ready";
        await store.save(current);
        throw new Error("钱包上下文改变，请重新复核");
      }
      const txHash = await w.send(current.snapshot, checked);
      const active = current.attempts.at(-1)!;
      active.originalHash = txHash;
      active.currentHash = txHash;
      current.status = transition(current.status, "broadcast");
      await store.save(current);
      progress?.(structuredClone(current));
      let replacementWrites = Promise.resolve();
      await g.wait(txHash, (replacement) => {
        active.replacements.push(replacement);
        active.currentHash = replacement.newHash;
        const snapshot = structuredClone(current);
        replacementWrites = replacementWrites.then(async () => {
          await store.save(snapshot);
          progress?.(snapshot);
        });
        void replacementWrites.catch(() => {});
      });
      await replacementWrites;
      try {
        active.nonce = (await g.transaction(active.currentHash!)).nonce;
      } catch {
        /* Leave the nonce unset when it is not available. */
      }
      current = await recoverBatch(current, g);
      await store.save(current);
    } catch (error) {
      if (current.status === "ready") throw error;
      const clearRejection =
        rejected(error) && !current.attempts.at(-1)?.currentHash;
      current.status = clearRejection ? "ready" : "unknown";
      current.attempts.at(-1)!.errorClass = clearRejection
        ? "signature_rejected"
        : "uncertain";
      current.attempts.at(-1)!.error =
        error instanceof Error ? error.message : "钱包拒绝签名";
      await store.save(current);
    }
    return current;
  };
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(
      recordKey(record.snapshot),
      { ifAvailable: true },
      (lock) => {
        if (!lock) throw new Error("另一个页面正在操作该批次");
        return run();
      },
    );
  return run();
}
export async function prepareRetry(
  record: BatchRecord,
  store: RecordStore,
  g: Gateway,
): Promise<BatchRecord> {
  if (!["unknown", "reverted", "cancelled"].includes(record.status))
    throw new Error("当前状态不可重试");
  if (
    (await g.chainId()) !== record.snapshot.chainId ||
    (await g.executed(record.snapshot))
  )
    throw new Error("批次已执行或网络错误，请继续核验");
  const next = { ...record, status: transition(record.status, "retry") };
  await store.save(next);
  return next;
}
