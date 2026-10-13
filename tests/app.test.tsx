import { renderChinese as render } from "./render-chinese";
import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../src/App";
import { MemoryStore } from "../src/storage";
import { mockGateway } from "./chain-fixtures";
import { keccak256 } from "viem";
import { a, payer, contract, hash } from "./fixtures";

describe("Chinese payment interface", () => {
  it("允许整理名单和连接钱包，未配置部署时仍禁止付款", async () => {
    render(
      <App
        runtime={{
          store: new MemoryStore(),
          deployments: [],
          wallets: [],
          gateway: () => mockGateway(),
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "批量发放 USDC" }),
    ).toBeInTheDocument();
    expect(screen.getByText("尚未添加收款人")).toBeInTheDocument();
    expect(screen.getAllByText(/尚未配置合约/).length).toBeGreaterThan(0);
    const summary = screen.getByRole("region", { name: "发放合计" });
    expect(
      within(summary).getByRole("button", { name: "连接钱包" }),
    ).toBeEnabled();
    expect(
      within(summary).queryByRole("button", { name: "确认并在钱包中付款" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
    await userEvent.type(screen.getByLabelText("第 1 行地址"), a);
    await userEvent.type(screen.getByLabelText("第 1 行金额"), "0.000001");
    expect(within(summary).getByText("0.000001")).toBeInTheDocument();
  });
  it("prepares, reviews, signs, verifies, and opens payment history", async () => {
    const g = mockGateway(),
      send = vi.fn(async () => hash);
    const wallet = {
      name: "测试钱包",
      connect: async () => ({ payer, chainId: 5042002 }),
      context: async () => ({ payer, chainId: 5042002 }),
      send,
      switchNetwork: async () => {},
      subscribe: () => () => {},
    };
    const deployment = {
      chainId: 5042002,
      contractAddress: contract,
      deploymentBlock: "1",
      transactionHash: hash,
      maxRecipients: "2",
      version: "1.0.0",
      compiler: "test",
      evmVersion: "paris",
      sourceHash: hash,
      runtimeCodeHash: keccak256("0x1234"),
      abiSource: "generated",
    };
    render(
      <App
        runtime={{
          store: new MemoryStore(),
          deployments: [deployment],
          wallets: [wallet],
          gateway: () => g,
        }}
      />,
    );
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "测试钱包" }));
    await userEvent.click(screen.getByRole("button", { name: "粘贴名单" }));
    await userEvent.type(
      screen.getByLabelText("粘贴地址与金额"),
      `${a} 1\n0x0000000000000000000000000000000000000002 2`,
    );
    await userEvent.click(screen.getByRole("button", { name: "导入粘贴内容" }));
    await userEvent.click(screen.getByRole("button", { name: "复核奖励" }));
    expect(await screen.findByText("确认付款信息")).toBeInTheDocument();
    expect(screen.getByText(/任一收款失败/)).toBeInTheDocument();
    expect(screen.getByText("余额与手续费").closest("details")).toHaveAttribute(
      "open",
    );
  });
});
