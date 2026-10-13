import { describe, it, expect, vi } from "vitest";
import {
  BaseError,
  ContractFunctionRevertedError,
  encodeErrorResult,
  UserRejectedRequestError,
} from "viem";
import { distributorAbi } from "../src/generated/abi";
import { errorMessage, download } from "../src/ui-utils";
import { b } from "./fixtures";
describe("Error messages and downloads", () => {
  it("localizes wallet rejection and supports flattened legacy transaction errors", () => {
    const rejected = new UserRejectedRequestError(
      new Error("User denied request signature."),
    );
    expect(
      errorMessage(new BaseError("钱包请求失败", { cause: rejected })),
    ).toBe("已取消这次钱包签名。");
    const legacy = new Error(
      "User rejected the request.\n\nRequest Arguments:\nfrom: 0x… data: 0x…\nDetails: User denied request signature.\nVersion: viem",
    );
    expect(errorMessage(legacy)).toBe("已取消这次钱包签名。");
    expect(
      errorMessage(
        new Error("请求未完成\n\nRequest Arguments:\ndata: 0x…\nVersion: viem"),
      ),
    ).toBe("请求未完成");
    // Once a hash is received, even a rejection error must leave the outcome awaiting verification.
    expect(errorMessage(legacy, "uncertain")).toContain("交易结果需核验");
  });
  it.each([
    ["signature_rejected", "已取消这次钱包签名。"],
    ["uncertain", "这次钱包或网络请求未完成，交易结果需核验。"],
    ["reverted", "这次交易已回滚，奖励未发放；仍可能产生手续费。"],
    ["cancelled", "这次交易已被取消。"],
    ["verification", "这次交易尚未通过完整核验。"],
  ] as const)(
    "shows an explicit notice for saved error class %s",
    (errorClass, expected) => {
      expect(errorMessage(new Error("原始 RPC 参数"), errorClass)).toBe(
        expected,
      );
    },
  );
  it("translates contract failure indices and preserves external errors", () => {
    const revert = new ContractFunctionRevertedError({
      abi: distributorAbi,
      functionName: "distribute",
      data: encodeErrorResult({
        abi: distributorAbi,
        errorName: "PaymentFailed",
        args: [1n, b],
      }),
    });
    expect(errorMessage(new BaseError("外层", { cause: revert }))).toMatch(
      /收款钱包拒收.*1/,
    );
    expect(errorMessage(new BaseError("普通错误"))).toBe("普通错误");
    const noArgs = new ContractFunctionRevertedError({
      abi: distributorAbi,
      functionName: "distribute",
      data: encodeErrorResult({
        abi: distributorAbi,
        errorName: "InvalidBatchId",
      }),
    });
    expect(errorMessage(noArgs)).toContain("批次 ID 不能为零");
    const unknownAbi = [
      { type: "error", name: "UnknownRemoteError", inputs: [] },
    ] as const;
    const unknown = new ContractFunctionRevertedError({
      abi: unknownAbi,
      functionName: "distribute",
      data: encodeErrorResult({
        abi: unknownAbi,
        errorName: "UnknownRemoteError",
      }),
    });
    expect(errorMessage(unknown)).toBe(unknown.shortMessage);
    expect(errorMessage(new Error("磁盘失败"))).toBe("磁盘失败");
    expect(errorMessage(null)).toContain("操作未完成");
  });
  it("creates and releases Blob download URLs", async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => "blob:test"),
      revoke = vi.fn();
    vi.stubGlobal(
      "URL",
      Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    download("报告", "text/csv", "report.csv");
    expect(click).toHaveBeenCalled();
    expect(create).toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(revoke).toHaveBeenCalledWith("blob:test");
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
