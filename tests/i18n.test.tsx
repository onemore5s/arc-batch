import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { I18nProvider, useI18n } from "../src/i18n";
import { LANGUAGE, readLocale, translate } from "../src/i18n/core";
import { exportReport, exportBackup } from "../src/domain/reports";
import { makeRecord } from "./fixtures";
import { WalletDialog } from "../src/WalletDialog";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.removeItem(LANGUAGE.storageKey);
});

function LanguageProbe() {
  const { t, locale, setLocale } = useI18n();
  return (
    <>
      <p>{t("收款名单")}</p>
      <output>{locale}</output>
      <button onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}>
        切换
      </button>
    </>
  );
}

describe("Bilingual messages and locale preferences", () => {
  it("never reads prototype properties for unknown external messages", () => {
    for (const message of [
      "constructor",
      "toString",
      "__proto__",
      "constructor（1）",
    ]) {
      expect(translate(message, "en")).toBe(message);
    }
  });
  it("translates application notices while preserving wallet-provided names", () => {
    localStorage.setItem(LANGUAGE.storageKey, "en");
    render(
      <I18nProvider>
        <WalletDialog
          wallets={[{ name: "发放完成" }]}
          error="已取消连接，可以重新选择钱包。"
          onSelect={vi.fn()}
          onClose={vi.fn()}
        />
      </I18nProvider>,
    );
    expect(
      screen.getByRole("dialog", { name: "Connect wallet" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "发放完成" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Connection cancelled. You can choose a wallet again.",
    );
  });
  it.each([
    [
      "草稿保存失败：地址无效。付款前必须修复存储。",
      "Unable to save the draft: Invalid address. Fix local storage before paying.",
    ],
    ["CSV 格式错误：Too few fields", "Invalid CSV: Too few fields"],
    [
      "第 3 行列数与表头不一致",
      "Row 3 has a different number of columns than the header",
    ],
    [
      "第 4 行需要地址和金额，用空格或制表符分隔",
      "Row 4 needs an address and amount separated by a space or tab",
    ],
    ["人数超过合约上限 20", "Recipient count exceeds the contract limit of 20"],
    [
      "不允许的状态转换：pending → retry",
      "Invalid state transition: pending → retry",
    ],
    [
      "收款钱包拒收，整个批次将回滚（0x123，1）",
      "A recipient rejected the transfer. The entire batch will revert. (0x123，1)",
    ],
    ["未知错误（0x123）", "未知错误（0x123）"],
  ])("renders legacy errors in the selected language: %s", (input, output) => {
    expect(translate(input, "en")).toBe(output);
    expect(translate(input, "zh-CN")).toBe(input);
  });
  it("translates templates and nested errors while preserving external messages and parameters", () => {
    expect(translate("收款名单", "en")).toBe("Recipients");
    expect(translate("{count} 位收款人", "en", { count: 1 })).toBe(
      "1 recipient",
    );
    expect(translate("{count} 位收款人", "en", { count: 2 })).toBe(
      "2 recipients",
    );
    expect(translate("第 7 行：收款地址重复，请主动修正", "en")).toBe(
      "Row 7: Duplicate recipient address. Please correct it.",
    );
    expect(translate("本地存储无法读取：地址无效", "en")).toBe(
      "Unable to read local storage: Invalid address",
    );
    expect(translate("RPC: timeout 504", "en")).toBe("RPC: timeout 504");
    expect(translate("复制 {value}", "en")).toBe("Copy {value}");
    expect(translate("第 {count} 次尝试", "en", { count: 1 })).toBe(
      "Attempt 1",
    );
    expect(translate("复制 {value}", "en", { value: "发放完成" })).toBe(
      "Copy 发放完成",
    );
    expect(translate("复制 {value}", "zh-CN", { value: "abc" })).toBe(
      "复制 abc",
    );
  });
  it("defaults to English and persists either language across remounts", async () => {
    const view = render(
      <I18nProvider>
        <LanguageProbe />
      </I18nProvider>,
    );
    expect(screen.getByText("Recipients")).toBeVisible();
    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("ArcBatch · Batch USDC payments");
    fireEvent.click(screen.getByRole("button", { name: "切换" }));
    expect(screen.getByText("收款名单")).toBeVisible();
    await waitFor(() => expect(document.documentElement.lang).toBe("zh-CN"));
    expect(document.title).toBe("ArcBatch · 社区奖励发放");
    expect(localStorage.getItem(LANGUAGE.storageKey)).toBe("zh-CN");
    view.unmount();
    render(
      <I18nProvider>
        <LanguageProbe />
      </I18nProvider>,
    );
    expect(screen.getByText("收款名单")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "切换" }));
    expect(document.documentElement.lang).toBe("en");
    expect(readLocale()).toBe("en");
  });
  it("allows language switching with invalid preferences or blocked storage", () => {
    localStorage.setItem(LANGUAGE.storageKey, "invalid");
    const view = render(
      <I18nProvider>
        <LanguageProbe />
      </I18nProvider>,
    );
    expect(screen.getByText("Recipients")).toBeVisible();
    view.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(
      <I18nProvider>
        <LanguageProbe />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "切换" }));
    expect(screen.getByText("收款名单")).toBeVisible();
  });
  it("localizes report statuses without modifying user content or backup format", () => {
    const record = { ...makeRecord(), activityName: "发放完成" };
    const backup = exportBackup([record]);
    expect(exportReport(record, "en")).toContain("Ready for review");
    expect(exportReport(record, "en")).toContain("发放完成");
    expect(exportReport(record)).toContain("Ready for review");
    expect(exportReport(record, "zh-CN")).toContain("待复核");
    expect(exportBackup([record])).toBe(backup);
  });
});
