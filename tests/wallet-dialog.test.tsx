import { renderChinese as render } from "./render-chinese";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WalletDialog } from "../src/WalletDialog";

const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E";
const wallets = [{ name: "Alpha Wallet", icon }, { name: "Beta Wallet" }];
function setup(overrides = {}) {
  const props = {
    wallets,
    error: "",
    onSelect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  return { ...render(<WalletDialog {...props} />), props };
}

describe("Wallet selection dialog", () => {
  it("shows discovered wallets, installation indicators, icons, and search results", async () => {
    const { props } = setup();
    const dialog = screen.getByRole("dialog", { name: "连接钱包" });
    expect(within(dialog).getAllByText("已安装")).toHaveLength(2);
    expect(screen.getByAltText("Alpha Wallet 图标")).toHaveAttribute(
      "src",
      icon,
    );
    expect(screen.getByRole("heading", { name: "连接钱包" })).toHaveFocus();
    await userEvent.type(
      screen.getByRole("searchbox", { name: "搜索钱包" }),
      " bEtA ",
    );
    expect(
      screen.queryByRole("button", { name: "Alpha Wallet" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Beta Wallet" }));
    expect(props.onSelect).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByRole("button", { name: "清除搜索" }));
    expect(screen.getByRole("searchbox")).toHaveFocus();
    expect(screen.getByRole("button", { name: "Alpha Wallet" })).toBeVisible();
    await userEvent.type(screen.getByRole("searchbox"), "不存在");
    expect(screen.getByText("未找到匹配的钱包")).toBeVisible();
  });

  it("closes via button, Escape, or backdrop without accidental inner-click dismissal", async () => {
    const { props } = setup();
    const dialog = screen.getByRole("dialog");
    await userEvent.click(screen.getByRole("heading"));
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.click(dialog);
    expect(props.onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(props.onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "关闭钱包选择" }));
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  it("blocks duplicate connection requests and displays connection errors", () => {
    const { rerender, props } = setup({ connectedIndex: 0, pendingIndex: 1 });
    expect(screen.getByText("已连接")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "请在 Beta Wallet 中确认连接",
    );
    expect(screen.getByRole("button", { name: "Alpha Wallet" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Beta Wallet" })).toBeDisabled();
    rerender(<WalletDialog {...props} error="已取消连接，请重新选择钱包。" />);
    expect(screen.getByRole("alert")).toHaveTextContent("已取消连接");
  });

  it("traps Tab and Shift+Tab focus inside the dialog", async () => {
    setup();
    const heading = screen.getByRole("heading");
    const close = screen.getByRole("button", { name: "关闭钱包选择" });
    const last = screen.getByRole("button", { name: "Beta Wallet" });
    fireEvent.keyDown(heading, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(last).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByRole("button", { name: "Alpha Wallet" })).toHaveFocus();
    await userEvent.tab();
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "ArrowLeft" });
    expect(last).toHaveFocus();
  });

  it("provides installation guidance without invented wallet counts", () => {
    setup({ wallets: [] });
    expect(screen.getByText("尚未检测到钱包")).toBeVisible();
    expect(screen.getByText(/启用钱包扩展后刷新页面/)).toBeVisible();
    expect(screen.queryByText("已安装")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("rejects remote icons and keeps wallets selectable after icon failure", async () => {
    const { props } = setup({
      wallets: [
        wallets[0],
        { name: "外部图标钱包", icon: "https://example.invalid/icon.svg" },
      ],
    });
    fireEvent.error(screen.getByAltText("Alpha Wallet 图标"));
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Alpha Wallet" }));
    expect(props.onSelect).toHaveBeenCalledWith(0);
  });

  it("restores scrolling and trigger focus on unmount", () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    document.body.style.overflow = "auto";
    const { unmount } = setup();
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
    expect(trigger).toHaveFocus();
    trigger.remove();
    document.body.style.overflow = "";
  });
});
