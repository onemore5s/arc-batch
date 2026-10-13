import { renderChinese as render } from "./render-chinese";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { PaymentFlow } from "../src/PaymentFlow";
import type { BatchRecord } from "../src/domain/types";
import { hash, makeRecord } from "./fixtures";

function currentStep() {
  return within(screen.getByRole("list", { name: "付款步骤" }))
    .getAllByRole("listitem")
    .find((item) => item.getAttribute("aria-current") === "step");
}

describe("Payment progress panel", () => {
  it("scrolls progress into view at signing without scrolling on every receipt update", () => {
    const scroll = vi.mocked(HTMLElement.prototype.scrollIntoView);
    scroll.mockClear();
    const record = makeRecord();
    const view = render(<PaymentFlow record={record} preflightReady />);
    expect(scroll).not.toHaveBeenCalled();
    view.rerender(
      <PaymentFlow record={{ ...record, status: "awaiting_signature" }} />,
    );
    expect(scroll).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
    view.rerender(<PaymentFlow record={{ ...record, status: "pending" }} />);
    expect(scroll).toHaveBeenCalledOnce();
  });
  it("stays on preflight until ready and waits for explicit signing", () => {
    const record = makeRecord();
    const view = render(<PaymentFlow record={record} checking />);
    expect(currentStep()).toHaveTextContent("付款检查");
    expect(screen.getByRole("status")).toHaveTextContent("正在检查付款条件");
    view.rerender(<PaymentFlow record={record} preflightReady />);
    expect(currentStep()).toHaveTextContent("钱包签名");
    expect(screen.getByRole("status")).toHaveTextContent("等待你确认付款");
    expect(screen.queryByText("签名请求已发起")).not.toBeInTheDocument();
    view.rerender(<PaymentFlow record={record} />);
    expect(currentStep()).toHaveTextContent("付款检查");
    expect(screen.getByRole("status")).toHaveTextContent("需要检查付款条件");
  });

  it.each([
    ["awaiting_signature", "钱包签名", "请在钱包中确认", "active"],
    ["pending", "链上确认", "等待链上回执", "active"],
    ["unknown", "钱包签名", "签名结果待核验", "attention"],
    ["reverted", "链上确认", "交易已回滚", "failed"],
    ["cancelled", "链上确认", "交易已取消", "attention"],
    ["confirmed", "链上确认", "发放结果待核验", "attention"],
    ["draft", "付款检查", "需要检查付款条件", "idle"],
  ] as const)(
    "maps %s to the actual stage without false completion",
    (status, step, message, mode) => {
      const record = { ...makeRecord(), status };
      render(<PaymentFlow record={record} />);
      expect(currentStep()).toHaveTextContent(step);
      expect(screen.getByRole("status")).toHaveTextContent(message);
      expect(screen.getByRole("region", { name: "发放流程" })).toHaveAttribute(
        "data-mode",
        mode,
      );
      expect(screen.queryByText("全部收款事件已核验")).not.toBeInTheDocument();
    },
  );

  it.each(["originalHash", "currentHash"] as const)(
    "verifies an unknown result with %s using the latest attempt",
    (key) => {
      const record: BatchRecord = { ...makeRecord(), status: "unknown" };
      record.attempts = [
        {
          id: "上次拒签",
          requestedAt: record.createdAt,
          replacements: [],
          errorClass: "signature_rejected",
          error: "原始错误不应出现在流程面板",
        },
        {
          id: "本次提交",
          requestedAt: record.createdAt,
          replacements: [],
          [key]: hash,
        },
      ];
      render(<PaymentFlow record={record} />);
      expect(currentStep()).toHaveTextContent("链上确认");
      expect(screen.getByRole("status")).toHaveTextContent("发放结果待核验");
      expect(screen.getByText("交易已提交至网络")).toBeVisible();
      expect(screen.queryByText(/原始错误/)).not.toBeInTheDocument();
    },
  );

  it("ignores old hashes for a new unbroadcast attempt", () => {
    const record = makeRecord();
    record.status = "unknown";
    record.attempts = [
      {
        id: "旧尝试",
        requestedAt: record.createdAt,
        replacements: [],
        currentHash: hash,
      },
      { id: "新尝试", requestedAt: record.createdAt, replacements: [] },
    ];
    render(<PaymentFlow record={record} />);
    expect(currentStep()).toHaveTextContent("钱包签名");
    expect(screen.queryByText("交易已提交至网络")).not.toBeInTheDocument();
  });

  it("returns rejection to preflight and permits a fresh signature only after validation", () => {
    const record = makeRecord();
    record.attempts = [
      {
        id: "拒签",
        requestedAt: record.createdAt,
        replacements: [],
        errorClass: "signature_rejected",
      },
    ];
    const view = render(<PaymentFlow record={record} />);
    expect(currentStep()).toHaveTextContent("付款检查");
    expect(screen.getByRole("status")).toHaveTextContent(
      "签名已取消，可重新确认",
    );
    view.rerender(<PaymentFlow record={record} preflightReady />);
    expect(currentStep()).toHaveTextContent("钱包签名");
    expect(screen.getByRole("status")).toHaveTextContent("等待你确认付款");
  });

  it("requires confirmed status and full evidence before completing every step", () => {
    const record = makeRecord();
    record.status = "confirmed";
    record.evidence = {
      transactionHash: hash,
      blockNumber: "10",
      gasUsed: "100",
      effectiveGasPrice: "2",
    };
    const view = render(<PaymentFlow record={record} />);
    expect(currentStep()).toHaveTextContent("发放完成");
    expect(screen.getByRole("status")).toHaveTextContent("全部收款事件已核验");
    expect(screen.getByRole("region", { name: "发放流程" })).toHaveAttribute(
      "data-mode",
      "complete",
    );
    expect(
      within(screen.getByRole("list", { name: "付款步骤" })).getAllByText(
        "已完成",
      ),
    ).toHaveLength(4);
    view.rerender(<PaymentFlow record={{ ...record, status: "unknown" }} />);
    expect(currentStep()).not.toHaveTextContent("发放完成");
    expect(screen.queryByText("全部收款事件已核验")).not.toBeInTheDocument();
  });
});
