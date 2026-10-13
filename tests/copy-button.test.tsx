import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "../src/CopyButton";
import { SETTINGS } from "../src/config";
import { I18nProvider } from "../src/i18n";
import { LANGUAGE } from "../src/i18n/core";
import { a, b } from "./fixtures";

beforeEach(() => {
  localStorage.setItem(LANGUAGE.storageKey, "zh-CN");
  vi.useFakeTimers();
  vi.stubGlobal("navigator", {
    clipboard: { writeText: vi.fn(async () => {}) },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.removeItem(LANGUAGE.storageKey);
});

describe("Shared copy control", () => {
  it("copies complete values and shows success only after the clipboard write", async () => {
    let finish!: () => void;
    vi.mocked(navigator.clipboard.writeText).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<CopyButton value={a} />, { wrapper: I18nProvider });
    const button = screen.getByRole("button", { name: `复制 ${a}` });
    expect(button).toHaveTextContent("");
    expect(button.querySelector("svg")).not.toBeNull();
    fireEvent.click(button);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(a);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await act(async () => finish());
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
    expect(button).toHaveAttribute("title", "已复制");
    act(() => vi.advanceTimersByTime(SETTINGS.copyFeedbackMs));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    await act(async () => fireEvent.click(button));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("已复制");
  });
  it.each(["rejected", "unavailable"])(
    "never reports clipboard success when %s",
    async (mode) => {
      if (mode === "rejected")
        vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
          new Error("denied"),
        );
      else vi.stubGlobal("navigator", {});
      render(<CopyButton value={a} label="付款钱包" />, {
        wrapper: I18nProvider,
      });
      await act(async () =>
        fireEvent.click(
          screen.getByRole("button", { name: `复制付款钱包 ${a}` }),
        ),
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        "复制失败，请手动复制",
      );
      expect(screen.getByRole("button")).toHaveAttribute(
        "title",
        "复制失败，请手动复制",
      );
    },
  );
  it("localizes English feedback and clears stale success after the address changes", async () => {
    localStorage.setItem(LANGUAGE.storageKey, "en");
    const view = render(
      <I18nProvider>
        <CopyButton value={a} label="Batch ID" />
      </I18nProvider>,
    );
    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Copy Batch ID",
    );
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", { name: `Copy Batch ID ${a}` }),
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    view.rerender(
      <I18nProvider>
        <CopyButton value={b} label="Batch ID" />
      </I18nProvider>,
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Copy Batch ID",
    );
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
