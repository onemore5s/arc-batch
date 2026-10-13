import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
} from "viem";
import { ATTEMPT_ERROR_MESSAGES } from "./config";
import type { TxAttempt } from "./domain/types";
const signatureRejection =
  /^(?:User rejected the request|User denied request signature)\b/i;
const viemMetadata =
  /\n\s*(?:Request Arguments:|Raw Call Arguments:|Details:|Version:)/i;
const contractErrors: Record<string, string> = {
  InvalidMaximum: "合约人数上限无效",
  InvalidBatchId: "批次 ID 不能为零",
  BatchAlreadyExecuted: "该批次已执行，请核验历史交易",
  InvalidRecipientCount: "名单为空或人数超过合约上限",
  LengthMismatch: "地址与金额数量不一致",
  ForbiddenRecipient: "收款地址被禁止",
  UnsortedRecipients: "地址必须严格升序，不能重复",
  InvalidAmount: "奖励金额或精度不合法",
  ValueMismatch: "交易金额与奖励总额不一致",
  PaymentFailed: "收款钱包拒收，整个批次将回滚",
  DirectTransferRejected: "请通过发奖调用付款",
  ReentrancyGuardReentrantCall: "合约阻止重入调用",
};
export function errorMessage(
  error: unknown,
  errorClass?: TxAttempt["errorClass"],
): string {
  if (errorClass) return ATTEMPT_ERROR_MESSAGES[errorClass];
  if (error instanceof BaseError) {
    if (
      error.walk((e) => e instanceof UserRejectedRequestError) instanceof
      UserRejectedRequestError
    )
      return ATTEMPT_ERROR_MESSAGES.signature_rejected;
    const revert = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (revert instanceof ContractFunctionRevertedError && revert.data) {
      const message = contractErrors[revert.data.errorName];
      if (message)
        return `${message}${revert.data.args ? `（${revert.data.args.join("，")}）` : ""}`;
    }
    return error.shortMessage;
  }
  const message =
    error instanceof Error ? error.message : "操作未完成，请检查钱包与网络";
  // Legacy records contain flattened messages, so viem error types are no longer available.
  if (signatureRejection.test(message))
    return ATTEMPT_ERROR_MESSAGES.signature_rejected;
  return message.split(viemMetadata, 1)[0].trim();
}
export function download(text: string, mime: string, name: string) {
  const url = URL.createObjectURL(
      new Blob([text], { type: `${mime};charset=utf-8` }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
