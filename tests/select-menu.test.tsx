import { renderChinese as render } from "./render-chinese";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SelectMenu } from "../src/SelectMenu";

const options = [
  { value: "first", label: "Alpha Wallet" },
  { value: "second", label: "Arc Wallet" },
  { value: "third", label: "Beta Wallet" },
];
const defaultProps = {
  label: "选择钱包",
  options,
  value: "second",
  onChange: vi.fn(),
};
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Shared selection menu", () => {
  it("marks the current option, returns selection, closes, and restores focus", async () => {
    render(<SelectMenu {...defaultProps} />);
    const trigger = screen.getByRole("combobox", { name: "选择钱包" });
    expect(trigger).toHaveTextContent("Arc Wallet");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { name: "Arc Wallet" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await userEvent.click(screen.getByRole("option", { name: "Beta Wallet" }));
    expect(defaultProps.onChange).toHaveBeenCalledWith("third");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("avoids reconnecting the current wallet and supports trigger toggling", async () => {
    render(<SelectMenu {...defaultProps} />);
    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("option", { name: "Arc Wallet" }));
    expect(defaultProps.onChange).not.toHaveBeenCalled();
    await userEvent.click(trigger);
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("supports arrow cycling, Home/End, and Enter selection", async () => {
    render(<SelectMenu {...defaultProps} />);
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "Beta Wallet" }).id,
    );
    await userEvent.keyboard("{ArrowDown}");
    expect(trigger).toHaveAttribute(
      "aria-activedescendant",
      screen.getByRole("option", { name: "Alpha Wallet" }).id,
    );
    await userEvent.keyboard("{ArrowUp}{Home}{End}{Enter}");
    expect(defaultProps.onChange).toHaveBeenCalledWith("third");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("supports Space, Escape, and Tab without unintended changes", async () => {
    render(
      <>
        <SelectMenu {...defaultProps} />
        <button>后续操作</button>
      </>,
    );
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await userEvent.keyboard(" {ArrowUp} ");
    expect(defaultProps.onChange).toHaveBeenCalledWith("first");
    defaultProps.onChange.mockClear();
    await userEvent.keyboard("{ArrowUp}{ArrowDown}{Escape}");
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}{Tab}");
    expect(screen.getByRole("button", { name: "后续操作" })).toHaveFocus();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(defaultProps.onChange).not.toHaveBeenCalled();
  });

  it("supports typeahead and repeated initials without changing unmatched values", async () => {
    render(<SelectMenu {...defaultProps} />);
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await userEvent.keyboard("be{Enter}");
    expect(defaultProps.onChange).toHaveBeenLastCalledWith("third");
    defaultProps.onChange.mockClear();
    await userEvent.keyboard("{Enter}aa{Enter}");
    expect(defaultProps.onChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}zz{Escape}");
    expect(defaultProps.onChange).not.toHaveBeenCalled();
  });

  it("resets expired typeahead and ignores unrelated key combinations", async () => {
    const clock = vi.spyOn(Date, "now");
    clock.mockReturnValue(0);
    render(<SelectMenu {...defaultProps} />);
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowLeft" });
    fireEvent.keyDown(trigger, { key: "b", ctrlKey: true });
    fireEvent.keyDown(trigger, { key: "b", altKey: true });
    fireEvent.keyDown(trigger, { key: "b", metaKey: true });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await userEvent.keyboard("a");
    clock.mockReturnValue(10000);
    await userEvent.keyboard("b{Enter}");
    expect(defaultProps.onChange).toHaveBeenCalledWith("third");
    clock.mockRestore();
  });

  it("closes on outside clicks and keeps only one menu open", async () => {
    render(
      <>
        <SelectMenu {...defaultProps} />
        <SelectMenu {...defaultProps} label="目标网络" />
        <button>外部操作</button>
      </>,
    );
    await userEvent.click(screen.getByRole("combobox", { name: "选择钱包" }));
    await userEvent.click(screen.getByRole("listbox"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("combobox", { name: "目标网络" }));
    expect(screen.getAllByRole("listbox")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "外部操作" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes when disabled or empty without reopening automatically", async () => {
    const { rerender } = render(<SelectMenu {...defaultProps} />);
    const trigger = screen.getByRole("combobox");
    await userEvent.click(trigger);
    rerender(<SelectMenu {...defaultProps} disabled />);
    expect(trigger).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    rerender(<SelectMenu {...defaultProps} value="third" />);
    expect(trigger).toHaveTextContent("Beta Wallet");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    rerender(<SelectMenu {...defaultProps} options={[]} />);
    expect(trigger).toBeDisabled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("handles unmatched initial values and dynamically reduced options", async () => {
    const { rerender } = render(
      <SelectMenu {...defaultProps} value="missing" />,
    );
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await userEvent.keyboard("{End}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    rerender(<SelectMenu {...defaultProps} options={[options[0]]} />);
    await userEvent.keyboard("{Enter}");
    expect(defaultProps.onChange).toHaveBeenCalledWith("first");
    trigger.focus();
    await userEvent.keyboard("{Home}{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
