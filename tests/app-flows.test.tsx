import { renderChinese as render } from "./render-chinese";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { keccak256, UserRejectedRequestError } from "viem";
import { App, type Runtime } from "../src/App";
import { MemoryStore } from "../src/storage";
import { chainEvidence, mockGateway } from "./chain-fixtures";
import { payer, contract, a, b, hash, makeRecord } from "./fixtures";
import type { BatchRecord } from "../src/domain/types";
import { exportBackup } from "../src/domain/reports";
import type { ConnectedWallet } from "../src/chain/adapters";
import type { WalletContext } from "../src/chain/types";
import { NETWORKS, SETTINGS, WALLET_UI, REOWN } from "../src/config";
import { LANGUAGE } from "../src/i18n/core";
class TestStore extends MemoryStore {
  draft: unknown;
  listeners = new Set<() => void>();
  async loadDraft() {
    return this.draft;
  }
  async saveDraft(value: unknown) {
    this.draft = value;
  }
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify() {
    for (const fn of this.listeners) fn();
  }
}
function setup(
  options: {
    store?: TestStore;
    wallets?: ConnectedWallet[];
    record?: BatchRecord;
    noDeployment?: boolean;
  } = {},
) {
  const store = options.store ?? new TestStore(),
    g = mockGateway();
  let active = options.record ?? makeRecord(),
    context: WalletContext = { payer, chainId: 5042002 };
  let listener: ((c: WalletContext | undefined) => void) | undefined;
  const wallet: ConnectedWallet = {
    name: "测试钱包",
    connect: vi.fn(async () => context),
    context: vi.fn(async () => context),
    send: vi.fn(async () => hash),
    switchNetwork: vi.fn(async (id) => {
      context = { ...context, chainId: id };
    }),
    subscribe: (fn) => {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
  };
  g.simulate = vi.fn(async (snapshot) => {
    active = { ...active, snapshot };
  });
  g.transaction = async () => chainEvidence(active).tx;
  g.receipt = async () => chainEvidence(active).receipt;
  g.wait = async () => chainEvidence(active).receipt;
  g.logs = async () => chainEvidence(active).receipt.logs;
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
  g.deployment = deployment;
  const runtime: Runtime = {
    store,
    deployments: options.noDeployment ? [] : [deployment],
    wallets: options.wallets ?? [wallet],
    gateway: () => g,
  };
  return {
    runtime,
    store,
    g,
    wallet,
    change: (c: WalletContext | undefined) => {
      if (c) context = c;
      listener?.(c);
    },
    setActive: (r: BatchRecord) => {
      active = r;
    },
  };
}
async function importPaste() {
  await userEvent.click(screen.getByRole("button", { name: "粘贴名单" }));
  fireEvent.change(screen.getByLabelText("粘贴地址与金额"), {
    target: { value: `${a} 1\n${b} 2` },
  });
  await userEvent.click(screen.getByRole("button", { name: "导入粘贴内容" }));
}
it("selects and verifies the configured mainnet deployment on startup", async () => {
  const { runtime, g } = setup();
  runtime.deployments[0].chainId = NETWORKS.mainnet.id;
  g.chainId = vi.fn(async () => NETWORKS.mainnet.id);
  const gateway = vi.fn(() => g);
  runtime.gateway = gateway;
  render(<App runtime={runtime} />);
  expect(screen.getByRole("combobox", { name: "目标网络" })).toHaveTextContent(
    NETWORKS.mainnet.name,
  );
  await waitFor(() => expect(g.maxRecipients).toHaveBeenCalled());
  expect(gateway).toHaveBeenCalledWith(NETWORKS.mainnet.id);
  expect(screen.queryByText(/尚未配置合约/)).not.toBeInTheDocument();
});
it("切换到测试网后核验测试网合约，并使用该合约生成付款快照", async () => {
  const env = setup();
  const testnet = env.runtime.deployments[0];
  const mainnet = {
    ...testnet,
    chainId: NETWORKS.mainnet.id,
    contractAddress: b,
  };
  const mainnetGateway = {
    ...mockGateway(),
    deployment: mainnet,
    chainId: vi.fn(async () => NETWORKS.mainnet.id),
  };
  env.runtime.deployments = [mainnet, testnet];
  env.runtime.gateway = vi.fn((chainId) =>
    chainId === NETWORKS.mainnet.id ? mainnetGateway : env.g,
  );
  render(<App runtime={env.runtime} />);
  await waitFor(() =>
    expect(mainnetGateway.maxRecipients).toHaveBeenCalledWith(
      mainnet.contractAddress,
    ),
  );
  await userEvent.click(screen.getByRole("combobox", { name: "目标网络" }));
  await userEvent.click(
    screen.getByRole("option", { name: NETWORKS.testnet.name }),
  );
  await waitFor(() =>
    expect(env.g.maxRecipients).toHaveBeenCalledWith(testnet.contractAddress),
  );
  expect(screen.queryByText(/尚未配置合约/)).not.toBeInTheDocument();
  await review();
  const records = await env.store.list();
  expect(records[0].snapshot).toMatchObject({
    chainId: NETWORKS.testnet.id,
    contractAddress: testnet.contractAddress,
  });
  expect(env.wallet.send).not.toHaveBeenCalled();
});
async function review() {
  await userEvent.click(
    within(screen.getByRole("banner")).getByRole("button", {
      name: "连接钱包",
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "测试钱包" }));
  await importPaste();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "复核奖励" })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole("button", { name: "复核奖励" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    ).toBeEnabled(),
  );
}
async function viewCompleted() {
  const result = await screen.findByRole("region", { name: "本次发放结果" });
  await userEvent.click(
    within(result).getByRole("button", { name: "查看本次详情" }),
  );
}
function file(text: string, name = "input.csv", size?: number) {
  const f = new File([text], name, {
    type: name.endsWith(".json") ? "application/json" : "text/csv",
  });
  Object.defineProperty(f, "text", { value: async () => text });
  if (size) Object.defineProperty(f, "size", { value: size });
  return f;
}
beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async () => {}) },
  });
});
afterEach(() => {
  localStorage.removeItem(LANGUAGE.storageKey);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Payment, export, and recovery interactions", () => {
  it("底部直接连接钱包，连接后继续完整校验，不自动发起付款", async () => {
    const env = setup();
    render(<App runtime={env.runtime} />);
    const summary = screen.getByRole("region", { name: "发放合计" });
    const connect = within(summary).getByRole("button", { name: "连接钱包" });
    expect(connect).toBeEnabled();
    await userEvent.click(connect);
    await userEvent.click(screen.getByRole("button", { name: "测试钱包" }));
    expect(
      within(summary).getByRole("button", { name: "复核奖励" }),
    ).toBeDisabled();
    await importPaste();
    expect(
      within(summary).getByRole("button", { name: "复核奖励" }),
    ).toBeEnabled();
    expect(env.wallet.connect).toHaveBeenCalledOnce();
    expect(env.wallet.send).not.toHaveBeenCalled();
    expect(await env.store.list()).toHaveLength(0);
  });
  it("底部复用 AppKit 钱包入口，并展示连接组件错误", async () => {
    const env = setup();
    env.runtime.openWallet = vi.fn(async () => {
      throw new Error("load failed");
    });
    render(<App runtime={env.runtime} />);
    await userEvent.click(
      within(screen.getByRole("region", { name: "发放合计" })).getByRole(
        "button",
        { name: "连接钱包" },
      ),
    );
    expect(env.runtime.openWallet).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent(REOWN.loadError);
  });
  it("确认页突出快照金额与钱包，技术详情默认折叠且可以展开", async () => {
    const env = setup();
    render(<App runtime={env.runtime} />);
    await review();
    const overview = screen.getByRole("group", { name: "付款概览" });
    expect(overview).toHaveTextContent("3 USDC");
    expect(overview).toHaveTextContent("2 位收款人");
    expect(overview).toHaveTextContent("Arc Testnet");
    expect(overview).toHaveTextContent(payer);
    const details = screen.getByText("交易详情").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText(contract)).not.toBeVisible();
    expect(screen.getByRole("table", { name: "收款名单" })).toBeVisible();
    await userEvent.click(screen.getByText("交易详情"));
    expect(within(details).getByText(contract)).toBeVisible();
    expect(details).toHaveTextContent(
      (await env.store.list())[0].snapshot.batchId,
    );
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(
      screen.getByRole("group", { name: "Payment overview" }),
    ).toHaveTextContent("2 recipients");
    expect(
      screen.getByText("Transaction details").closest("details"),
    ).toHaveAttribute("open");
  });
  it("清空名单后可撤销，保留活动名、原始行号、备注和已有发放记录", async () => {
    const { runtime, store } = setup();
    const record = makeRecord();
    await store.save(record);
    render(<App runtime={runtime} />);
    fireEvent.change(screen.getByLabelText("活动名称", { exact: false }), {
      target: { value: "活动" },
    });
    await userEvent.upload(
      screen.getByLabelText("导入 CSV"),
      file(`address,amount,label\n${a},1,备注\nwrong,wrong,`),
    );
    expect(await screen.findByLabelText("第 3 行地址")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await userEvent.click(screen.getByRole("button", { name: "粘贴名单" }));
    fireEvent.change(screen.getByLabelText("粘贴地址与金额"), {
      target: { value: `${b} 2` },
    });
    await userEvent.click(screen.getByRole("button", { name: "清空名单" }));
    expect(screen.getByText("尚未添加收款人")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("已清空 2 行");
    expect(screen.getByRole("button", { name: "撤销" })).toHaveFocus();
    expect(screen.queryByLabelText("粘贴地址与金额")).not.toBeInTheDocument();
    expect(screen.getByLabelText("活动名称", { exact: false })).toHaveValue(
      "活动",
    );
    await waitFor(() =>
      expect(store.draft).toEqual({ activityName: "活动", rows: [] }),
    );
    expect(await store.list()).toEqual([record]);
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("status")).toHaveTextContent("Cleared 2 rows");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByLabelText("Row 2 address")).toHaveValue(a);
    expect(screen.getByLabelText("Row 2 amount")).toHaveValue("1");
    expect(screen.getByLabelText("Row 2 label")).toHaveValue("备注");
    expect(screen.getByLabelText("Row 3 address")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Paste addresses and amounts")).toHaveValue(
      `${b} 2`,
    );
    expect(screen.getByRole("heading", { name: /^Recipients$/ })).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: "Undo" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect((store.draft as { rows: unknown[] }).rows).toHaveLength(2),
    );
  });
  it.each(["manual", "csv", "paste"])(
    "开始新名单时撤销入口失效，避免覆盖新输入：%s",
    async (method) => {
      const { runtime } = setup();
      render(<App runtime={runtime} />);
      await importPaste();
      await userEvent.click(screen.getByRole("button", { name: "清空名单" }));
      if (method === "manual") {
        await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
        expect(screen.getByLabelText("第 1 行地址")).toHaveValue("");
        expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
      } else if (method === "csv") {
        await userEvent.upload(
          screen.getByLabelText("导入 CSV"),
          file(`address,amount\n${b},3`),
        );
        expect(await screen.findByLabelText("第 2 行地址")).toHaveValue(b);
      } else {
        await userEvent.click(screen.getByRole("button", { name: "粘贴名单" }));
        await userEvent.type(screen.getByLabelText("粘贴地址与金额"), `${b} 3`);
      }
      expect(
        screen.queryByRole("button", { name: "撤销" }),
      ).not.toBeInTheDocument();
    },
  );
  it("空白行保持安静，离开字段后提示错误，修正后立即清除", async () => {
    const { runtime } = setup();
    render(<App runtime={runtime} />);
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "测试钱包" }));
    await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
    const address = screen.getByLabelText("第 1 行地址");
    const amount = screen.getByLabelText("第 1 行金额");
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    await userEvent.type(address, "wrong");
    expect(address).not.toHaveAttribute("aria-invalid", "true");
    await userEvent.tab();
    expect(address).toHaveAccessibleDescription("钱包地址或校验和无效");
    expect(amount).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "复核奖励" })).toBeDisabled();
    fireEvent.change(address, { target: { value: a } });
    expect(address).not.toHaveAttribute("aria-invalid", "true");
    await userEvent.type(amount, "wrong");
    await userEvent.tab();
    expect(amount).toHaveAccessibleDescription(
      "金额须为普通正十进制，最多 6 位小数",
    );
    fireEvent.change(amount, { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "复核奖励" })).toBeEnabled();
    await userEvent.clear(amount);
    await userEvent.tab();
    expect(amount).toHaveAccessibleDescription("请输入金额");
    await userEvent.click(screen.getByRole("button", { name: "删除第 1 行" }));
    await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
  });
  it("导入时直接定位错误，重新导入和手动新行不会继承旧错误状态", async () => {
    const { runtime } = setup();
    render(<App runtime={runtime} />);
    await userEvent.upload(
      screen.getByLabelText("导入 CSV"),
      file("address,amount,label\nwrong,wrong,note"),
    );
    const address = await screen.findByLabelText("第 2 行地址");
    expect(address).toHaveAccessibleDescription("钱包地址或校验和无效");
    expect(screen.getByLabelText("第 2 行金额")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await importPaste();
    expect(document.querySelector('[aria-invalid="true"]')).toBeNull();
    fireEvent.change(screen.getByLabelText("第 2 行地址"), {
      target: { value: a },
    });
    expect(screen.getByLabelText("第 2 行地址")).toHaveAccessibleDescription(
      "收款地址重复，请主动修正",
    );
    await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
    expect(screen.getByLabelText("第 3 行地址")).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByText("人数超过合约上限 2")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByLabelText("Row 2 address")).toHaveAccessibleDescription(
      "Duplicate recipient address. Please correct it.",
    );
  });
  it("下载含占位符的 CSV 模板，并在空名单中解释替换方式", async () => {
    const { runtime } = setup();
    render(<App runtime={runtime} />);
    expect(
      screen.getByRole("region", { name: "CSV 格式示例" }),
    ).toHaveTextContent("address");
    expect(
      screen.getByText("将模板中的占位内容替换为收款信息后再导入。"),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "下载模板" }));
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(text).toBe(
      "address,amount,label\r\n<recipient_address>,<amount_usdc>,<optional_label>\r\n",
    );
    expect(screen.queryByLabelText("第 1 行地址")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(
      screen.getByRole("button", { name: "Download template" }),
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "CSV format example" }),
    ).toHaveTextContent("Recipient address");
  });
  it("preserves recipients, names, and errors while translating history and guide", async () => {
    const env = setup();
    render(<App runtime={env.runtime} />);
    await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
    fireEvent.change(screen.getByLabelText("活动名称", { exact: false }), {
      target: { value: "发放完成" },
    });
    fireEvent.change(screen.getByLabelText("第 1 行地址"), {
      target: { value: a },
    });
    fireEvent.change(screen.getByLabelText("第 1 行金额"), {
      target: { value: "wrong" },
    });
    fireEvent.blur(screen.getByLabelText("第 1 行金额"));
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Send USDC in batches",
    );
    expect(screen.getByLabelText("Batch name", { exact: false })).toHaveValue(
      "发放完成",
    );
    expect(screen.getByLabelText("Row 1 address")).toHaveValue(a);
    expect(screen.getByLabelText("Row 1 amount")).toHaveValue("wrong");
    expect(
      screen.getByText(
        "Use a positive decimal amount with up to 6 decimal places",
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByText("No batches yet")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Guide" }));
    expect(screen.getByText(/A timeout does not mean failure/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await userEvent.click(screen.getByRole("button", { name: "简体中文" }));
    expect(screen.getByLabelText("第 1 行金额")).toHaveValue("wrong");
    expect(
      screen.getByText("金额须为普通正十进制，最多 6 位小数"),
    ).toBeVisible();
  });
  it("switches language during payment without reconnecting or resubmitting", async () => {
    const env = setup();
    let resolveSend!: (value: typeof hash) => void;
    vi.mocked(env.wallet.send).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSend = resolve;
        }),
    );
    render(<App runtime={env.runtime} />);
    await review();
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("Ready for your confirmation")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Confirm in wallet" }),
    ).toBeEnabled();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm in wallet" }),
    );
    await screen.findByText("Confirm in your wallet");
    await userEvent.click(screen.getByRole("button", { name: "简体中文" }));
    expect(screen.getByText("请在钱包中确认")).toBeVisible();
    expect(screen.getByRole("button", { name: "正在处理…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "English" }));
    await act(async () => resolveSend(hash));
    const result = await screen.findByRole("region", {
      name: "Payment result",
    });
    expect(result).toHaveTextContent("sent to 2 recipients");
    expect(screen.getByText("No recipients yet")).toBeVisible();
    expect(env.wallet.send).toHaveBeenCalledOnce();
    expect(env.wallet.connect).toHaveBeenCalledOnce();
    await userEvent.click(
      within(result).getByRole("button", { name: "View details" }),
    );
    expect(screen.getByText("All payments verified")).toBeVisible();
    expect(screen.getAllByText("Paid")).toHaveLength(2);
  });
  it("prepares a fresh list after verification while retaining the original payment record", async () => {
    const env = setup();
    render(<App runtime={env.runtime} />);
    await review();
    await userEvent.click(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    );
    const result = await screen.findByRole("region", { name: "本次发放结果" });
    expect(result).toHaveTextContent("发放完成");
    expect(result).toHaveTextContent("3 USDC");
    expect(screen.getByText("尚未添加收款人")).toBeVisible();
    expect(screen.getByLabelText("活动名称", { exact: false })).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "创建新的奖励批次" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "确认并在钱包中付款" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(env.store.draft).toEqual({ rows: [], activityName: "" }),
    );
    const saved = (await env.store.list())[0];
    expect(saved.status).toBe("confirmed");
    expect(saved.evidence).toBeDefined();
    expect(saved.snapshot.recipients).toHaveLength(2);
    expect(env.wallet.send).toHaveBeenCalledOnce();
    await userEvent.click(
      within(result).getByRole("button", { name: "导出报告" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
    fireEvent.change(screen.getByLabelText("第 1 行地址"), {
      target: { value: b },
    });
    await userEvent.click(
      within(result).getByRole("button", { name: "查看本次详情" }),
    );
    await userEvent.click(screen.getByText("交易详情"));
    expect(screen.getByText(saved.snapshot.batchId)).toBeVisible();
    expect(screen.getByRole("region", { name: "发放流程" })).toHaveAttribute(
      "data-mode",
      "complete",
    );
    await userEvent.click(screen.getByRole("button", { name: "批量发放" }));
    expect(screen.getByLabelText("第 1 行地址")).toHaveValue(b);
    await userEvent.click(screen.getByRole("button", { name: "关闭发放结果" }));
    expect(
      screen.queryByRole("region", { name: "本次发放结果" }),
    ).not.toBeInTheDocument();
  });
  it("retains snapshots without displaying unverified historical success", async () => {
    const store = new TestStore();
    const record = makeRecord();
    record.status = "confirmed";
    await store.save(record);
    render(<App runtime={setup({ store }).runtime} />);
    await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "查看批次" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "批量发放" }));
    await userEvent.click(screen.getByText("交易详情"));
    expect(screen.getByText(record.snapshot.batchId)).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "本次发放结果" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "发放下一批" }),
    ).not.toBeInTheDocument();
  });
  it("retains unknown recipients until verification allows the next batch", async () => {
    const env = setup();
    vi.mocked(env.wallet.send).mockRejectedValueOnce(new Error("网络中断"));
    env.g.logs = async () => [];
    render(<App runtime={env.runtime} />);
    await review();
    await userEvent.click(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    );
    expect(
      await screen.findByText("结果待核验", { exact: true }),
    ).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "本次发放结果" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新整理名单" })).toBeDisabled();
    const saved = (await env.store.list())[0];
    env.g.logs = async () => chainEvidence(saved).receipt.logs;
    env.g.executed = async () => true;
    await userEvent.click(screen.getByRole("button", { name: "继续查询" }));
    expect(
      await screen.findByRole("region", { name: "本次发放结果" }),
    ).toBeVisible();
    expect(screen.getByText("尚未添加收款人")).toBeVisible();
  });
  it("clears frozen context when editing an unpaid list", async () => {
    const env = setup();
    render(<App runtime={env.runtime} />);
    await review();
    await userEvent.click(screen.getByRole("button", { name: "重新整理名单" }));
    expect(screen.getByText("尚未添加收款人")).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "发放流程" }),
    ).not.toBeInTheDocument();
  });
  it("uses AppKit's entry point and subscriptions for connection context", async () => {
    const env = setup();
    env.runtime.openWallet = vi.fn(async () => {});
    render(<App runtime={env.runtime} />);
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    expect(env.runtime.openWallet).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(env.wallet.connect).not.toHaveBeenCalled();
    await act(async () => env.change({ payer, chainId: 5042002 }));
    await userEvent.click(screen.getByRole("button", { name: "切换钱包" }));
    expect(env.runtime.openWallet).toHaveBeenCalledTimes(2);
    await act(async () => env.change(undefined));
    expect(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    ).toBeEnabled();
  });
  it("shows an actionable AppKit error without third-party call internals", async () => {
    const env = setup();
    env.runtime.openWallet = vi.fn().mockRejectedValue(new Error("SDK 详情"));
    render(<App runtime={env.runtime} />);
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(REOWN.loadError);
  });
  it("retains browser wallets with a clear QR-unavailable notice", async () => {
    const env = setup();
    env.runtime.walletNotice = REOWN.fallbackNotice;
    render(<App runtime={env.runtime} />);
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    expect(screen.getByText(REOWN.fallbackNotice)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "测试钱包" }));
    expect(screen.getByRole("button", { name: "切换钱包" })).toBeEnabled();
  });
  it("connects only after selection and retains pending progress across dialog reopening", async () => {
    const env = setup();
    let finish!: (context: WalletContext) => void;
    vi.mocked(env.wallet.connect).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<App runtime={env.runtime} />);
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    expect(env.wallet.connect).not.toHaveBeenCalled();
    await userEvent.dblClick(screen.getByRole("button", { name: "测试钱包" }));
    expect(env.wallet.connect).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/请在 测试钱包 中确认连接/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "关闭钱包选择" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    expect(screen.getByRole("button", { name: "测试钱包" })).toBeDisabled();
    await act(async () => finish({ payer, chainId: 5042002 }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换钱包" })).toBeEnabled();
  });
  it.each([
    [{ code: WALLET_UI.rejectedCode }, WALLET_UI.rejectedMessage],
    [{ code: WALLET_UI.pendingRequestCode }, WALLET_UI.pendingMessage],
    [new Error("底层错误详情"), WALLET_UI.failedMessage],
    ["意外错误", WALLET_UI.failedMessage],
    [null, WALLET_UI.failedMessage],
  ])(
    "shows concise connection failures in the dialog and allows retry: %j",
    async (failure, message) => {
      const env = setup();
      vi.mocked(env.wallet.connect).mockRejectedValueOnce(failure);
      render(<App runtime={env.runtime} />);
      await userEvent.click(
        within(screen.getByRole("banner")).getByRole("button", {
          name: "连接钱包",
        }),
      );
      await userEvent.click(screen.getByRole("button", { name: "测试钱包" }));
      expect(
        within(screen.getByRole("dialog")).getByRole("alert"),
      ).toHaveTextContent(message);
      expect(screen.getByRole("button", { name: "测试钱包" })).toBeEnabled();
      await userEvent.click(screen.getByRole("button", { name: "测试钱包" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    },
  );
  it("retains the old account on failed switching and invalidates preflight after success", async () => {
    const env = setup();
    const other = {
      ...env.wallet,
      name: "另一钱包",
      connect: vi.fn(async () => ({ payer: b, chainId: 5042002 })),
    };
    other.connect.mockRejectedValueOnce({ code: WALLET_UI.rejectedCode });
    env.runtime.wallets.push(other);
    render(<App runtime={env.runtime} />);
    await review();
    await userEvent.click(screen.getByRole("button", { name: "切换钱包" }));
    const first = screen.getByRole("button", { name: "测试钱包" });
    expect(within(first).getByText("已连接")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "另一钱包" }));
    expect(within(first).getByText("已连接")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "另一钱包" }));
    expect(screen.getByRole("button", { name: "切换钱包" })).toHaveTextContent(
      `${b.slice(0, 6)}…${b.slice(-4)}`,
    );
    expect(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    ).toBeDisabled();
    expect(other.connect).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: "切换钱包" }));
    expect(
      within(screen.getByRole("button", { name: "另一钱包" })).getByText(
        "已连接",
      ),
    ).toBeVisible();
  });
  it("preserves input order for review while keeping execution snapshots address-sorted", async () => {
    const env = setup();
    env.store.draft = {
      activityName: "顺序验证",
      rows: [
        { sourceRow: 2, address: b, amount: "2.00", label: "先导入" },
        { sourceRow: 3, address: a, amount: "1", label: "后导入" },
      ],
    };
    render(<App runtime={env.runtime} />);
    await screen.findByDisplayValue("顺序验证");
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "测试钱包" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "复核奖励" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "复核奖励" }));
    let table = await screen.findByRole("table", { name: "收款名单" });
    const dataRows = within(table).getAllByRole("row").slice(1);
    expect(
      dataRows.map((row) => within(row).getByRole("rowheader").textContent),
    ).toEqual(["2", "3"]);
    expect(within(dataRows[0]).getByText(b)).toBeVisible();
    expect(within(dataRows[0]).getByText("2.00")).toBeVisible();
    expect(within(dataRows[0]).getByText("先导入")).toBeVisible();
    expect(within(dataRows[1]).getByText(a)).toBeVisible();
    expect(within(dataRows[1]).getByText("后导入")).toBeVisible();
    expect(within(table).getAllByText("待付款")).toHaveLength(2);
    expect(within(table).queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByText(/原始行/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "确认并在钱包中付款" }),
      ).toBeEnabled(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    );
    await viewCompleted();
    table = screen.getByRole("table", { name: "收款名单" });
    await waitFor(() =>
      expect(within(table).getAllByText("已发放")).toHaveLength(2),
    );
    const submitted = vi.mocked(env.wallet.send).mock.calls[0][0];
    expect(submitted.recipients.map((row) => row.address)).toEqual([a, b]);
    expect(submitted.recipients.map((row) => row.sourceRow)).toEqual([3, 2]);
    expect(submitted.recipients.map((row) => row.amountNative)).toEqual([
      "1000000000000000000",
      "2000000000000000000",
    ]);
    expect(
      within(table)
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getByRole("rowheader").textContent),
    ).toEqual(["2", "3"]);
  });
  it.each([
    ["ready", "待付款"],
    ["awaiting_signature", "待签名"],
    ["pending", "确认中"],
    ["unknown", "待核验"],
    ["reverted", "未发放"],
    ["cancelled", "已取消"],
    ["confirmed", "待核验"],
  ] as const)(
    "shows batch %s row status as %s without claiming unverified payment",
    async (status, label) => {
      const store = new TestStore(),
        record = makeRecord();
      record.status = status;
      await store.save(record);
      const env = setup({ store });
      env.g.executed = async () => false;
      env.g.logs = async () => [];
      render(<App runtime={env.runtime} />);
      await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
      await userEvent.click(
        await screen.findByRole("button", { name: "查看批次" }),
      );
      expect(
        within(screen.getByRole("table", { name: "收款名单" })).getAllByText(
          label,
        ),
      ).toHaveLength(2);
    },
  );
  it("collapses historical rejections after success and retains the current transaction link", async () => {
    const store = new TestStore(),
      record = makeRecord();
    record.status = "confirmed";
    record.evidence = {
      transactionHash: hash,
      blockNumber: "10",
      gasUsed: "100",
      effectiveGasPrice: "2",
    };
    record.attempts = [
      {
        id: "拒签尝试",
        requestedAt: record.createdAt,
        replacements: [],
        errorClass: "signature_rejected",
        error:
          "User rejected the request.\nRequest Arguments: data: 0xabcdef\nVersion: viem",
      },
      {
        id: "成功尝试",
        requestedAt: record.createdAt,
        replacements: [],
        currentHash: hash,
      },
    ];
    await store.save(record);
    render(<App runtime={setup({ store }).runtime} />);
    await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "查看批次" }),
    );
    expect(screen.getByText("已核验发放", { exact: true })).toBeVisible();
    expect(screen.getByRole("link", { name: /查看交易/ })).toBeVisible();
    expect(screen.getByText("已取消这次钱包签名。")).not.toBeVisible();
    expect(screen.queryByText(/Request Arguments/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("付款尝试记录（2 次）"));
    expect(screen.getByText("已取消这次钱包签名。")).toBeVisible();
    expect(screen.getByText("第 1 次尝试")).toBeVisible();
    expect(screen.getByText("第 2 次尝试")).toBeVisible();
    expect(
      screen.queryByText(/User rejected|0xabcdef|Version: viem/),
    ).not.toBeInTheDocument();
  });
  it("shows concise rejection and completes payment after preflighting the original snapshot", async () => {
    const env = setup();
    vi.mocked(env.wallet.send).mockRejectedValueOnce(
      new UserRejectedRequestError(new Error("User denied request signature.")),
    );
    render(<App runtime={env.runtime} />);
    await review();
    const frozenId = screen.getByText(/^0x[a-f0-9]{64}$/).textContent;
    await userEvent.click(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    );
    expect(await screen.findByText("已取消这次钱包签名。")).toBeVisible();
    expect(screen.getByText("待复核", { exact: true })).toBeVisible();
    expect(screen.queryByText(/User rejected/)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "重新预检原快照" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "确认并在钱包中付款" }),
      ).toBeEnabled(),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    );
    await viewCompleted();
    expect(screen.getByText("已核验发放", { exact: true })).toBeVisible();
    await userEvent.click(screen.getByText("交易详情"));
    expect(screen.getByText(frozenId!)).toBeVisible();
    expect(screen.getByText("已取消这次钱包签名。")).not.toBeVisible();
    expect(env.wallet.send).toHaveBeenCalledTimes(2);
  });
  it("shortens history references while copying full values and preserving batch action targets", async () => {
    const store = new TestStore(),
      record = makeRecord(),
      other = makeRecord();
    other.activityName = "另一个批次";
    other.snapshot.batchId = hash;
    await store.save(record);
    await store.save(other);
    render(<App runtime={setup({ store }).runtime} />);
    await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
    const table = await screen.findByRole("table", { name: "本地发放记录" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["奖励批次", "发放金额", "网络与钱包", "状态", "操作"]);
    const row = within(table).getByRole("row", { name: /测试活动/ });
    expect(within(row).getByText("0x1111…1111")).toHaveAttribute(
      "title",
      record.snapshot.batchId,
    );
    for (const [label, value] of [
      ["批次 ID", record.snapshot.batchId],
      ["付款钱包", payer],
      ["合约地址", contract],
    ]) {
      await userEvent.click(
        within(row).getByRole("button", {
          name: `复制${label} ${value}`,
        }),
      );
      expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(value);
    }
    expect(within(row).getByRole("button", { name: "继续查询" })).toBeEnabled();
    await userEvent.click(
      within(row).getByRole("button", { name: "导出 CSV" }),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    await userEvent.click(
      within(row).getByRole("button", { name: "查看批次" }),
    );
    expect(screen.getByText(record.snapshot.batchId)).toBeInTheDocument();
    expect(screen.getByText(payer)).toBeInTheDocument();
  });
  it("recovers signing and pending batches after refresh and keeps RPC failures unknown", async () => {
    const store = new TestStore(),
      record = makeRecord();
    record.status = "awaiting_signature";
    record.attempts = [
      {
        id: "恢复",
        requestedAt: new Date().toISOString(),
        currentHash: hash,
        replacements: [],
      },
    ];
    await store.save(record);
    const env = setup({ store, record });
    let tick: () => void = () => {};
    const intervals = vi.spyOn(globalThis, "setInterval");
    render(<App runtime={env.runtime} />);
    await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
    await screen.findByText("等待钱包确认");
    tick = intervals.mock.calls.find(
      ([, delay]) => delay === SETTINGS.pollMs,
    )![0] as () => void;
    await act(async () => tick());
    await waitFor(() =>
      expect(
        screen.getByText("已核验发放", { exact: true }),
      ).toBeInTheDocument(),
    );
    record.status = "unknown";
    await store.save(record);
    env.g.chainId = async () => {
      throw new Error("RPC 离线");
    };
    await act(async () => tick());
    await waitFor(() =>
      expect(
        screen.getByText("结果待核验", { exact: true }),
      ).toBeInTheDocument(),
    );
    const list = vi
      .spyOn(store, "list")
      .mockRejectedValueOnce(new Error("存储离线"));
    await act(async () => tick());
    expect(list).toHaveBeenCalled();
  });
  it("shows cross-tab and draft-storage failures and allows empty-history navigation", async () => {
    const env = setup();
    vi.spyOn(env.store, "saveDraft").mockRejectedValue(new Error("配额不足"));
    render(<App runtime={env.runtime} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("草稿保存失败");
    vi.spyOn(env.store, "list").mockRejectedValueOnce(
      new Error("跨页读取失败"),
    );
    await act(async () => env.store.notify());
    expect(await screen.findByRole("alert")).toHaveTextContent("跨页读取失败");
    await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
    await userEvent.click(screen.getByRole("button", { name: "去整理名单" }));
    await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
    await userEvent.click(screen.getByRole("button", { name: "手动添加" }));
    expect(screen.getByLabelText("第 2 行地址")).toBeInTheDocument();
  });
  it("shows unknown batch history and labels while blocking retry without the original wallet", async () => {
    const record = makeRecord();
    record.status = "unknown";
    record.snapshot.recipients[0].label = "贡献者";
    record.attempts = [
      {
        id: "replace",
        requestedAt: new Date().toISOString(),
        originalHash: hash,
        currentHash: hash,
        replacements: [{ oldHash: hash, newHash: hash, reason: "repriced" }],
      },
    ];
    const store = new TestStore();
    await store.save(record);
    const env = setup({ store, record });
    render(<App runtime={env.runtime} />);
    await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
    await screen.findByText("测试活动");
    await userEvent.click(screen.getByRole("button", { name: "查看批次" }));
    expect(screen.getByText(/替换原因 repriced/)).toBeInTheDocument();
    expect(screen.getByText(/贡献者/)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "明确重试原批次" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("原付款钱包");
    await userEvent.click(screen.getByRole("button", { name: "继续查询" }));
    expect(
      await screen.findByText("已核验发放", { exact: true }),
    ).toBeInTheDocument();
  });
  it("discards asynchronous initialization after unmount", async () => {
    const env = setup();
    let finish: (records: BatchRecord[]) => void = () => {};
    vi.spyOn(env.store, "list").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<App runtime={env.runtime} />);
    view.unmount();
    await act(async () => finish([]));
  });
  it("shows pending hashes immediately and freezes submission while awaiting receipts", async () => {
    const env = setup();
    let finish: (() => void) | undefined;
    env.g.wait = async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return chainEvidence().receipt;
    };
    render(<App runtime={env.runtime} />);
    expect(
      screen.queryByRole("region", { name: "发放流程" }),
    ).not.toBeInTheDocument();
    await review();
    const flow = screen.getByRole("region", { name: "发放流程" });
    expect(within(flow).getByRole("status")).toHaveTextContent(
      "等待你确认付款",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    );
    expect(
      await screen.findByText("待链上确认", { exact: true }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /查看交易/ })).toHaveAttribute(
      "href",
      expect.stringContaining(hash),
    );
    expect(screen.getByRole("button", { name: "正在处理…" })).toBeDisabled();
    expect(within(flow).getByRole("status")).toHaveTextContent("等待链上回执");
    expect(within(flow).getByText("链上确认").closest("li")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await act(async () => finish?.());
  });
  it("shows actual fees and supports reports, history, backups, and new batches", async () => {
    const { runtime, wallet } = setup();
    render(<App runtime={runtime} />);
    await review();
    await userEvent.click(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    );
    await viewCompleted();
    expect(
      await screen.findByText("已核验发放", { exact: true }),
    ).toBeInTheDocument();
    expect(wallet.send).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getAllByRole("button", { name: /复制/ })[0]);
    await userEvent.click(screen.getByRole("button", { name: "导出发放报告" }));
    await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
    expect(screen.getByText("未命名奖励")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "导出 CSV" }));
    await userEvent.click(screen.getByRole("button", { name: "备份全部记录" }));
    await userEvent.click(screen.getByRole("button", { name: "查看批次" }));
    await userEvent.click(screen.getByRole("button", { name: "发放下一批" }));
    expect(
      screen.getByRole("button", { name: "复核奖励" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /了解发放规则/ }));
    expect(
      screen.getByRole("heading", { name: "发放流程" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /ArcBatch/ }));
  });
  it("retains rejected snapshots and offers verification and same-ID retry after communication errors", async () => {
    const { runtime, wallet, store } = setup();
    vi.mocked(wallet.send).mockRejectedValueOnce({ code: 4001 });
    render(<App runtime={runtime} />);
    await review();
    await userEvent.click(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    );
    expect(
      await screen.findByText("待复核", { exact: true }),
    ).toBeInTheDocument();
    const id = (await store.list())[0].snapshot.batchId;
    await userEvent.click(
      screen.getByRole("button", { name: "重新预检原快照" }),
    );
    vi.mocked(wallet.send).mockRejectedValueOnce(new Error("通信异常"));
    await userEvent.click(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    );
    expect(
      await screen.findByText("结果待核验", { exact: true }),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "明确重试原批次" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "确认并在钱包中付款" }),
      ).toBeEnabled(),
    );
    expect((await store.list())[0].snapshot.batchId).toBe(id);
  });
  it("imports, edits, removes, and validates CSV and pasted recipients", async () => {
    const { runtime } = setup();
    render(<App runtime={runtime} />);
    await userEvent.upload(
      screen.getByLabelText("导入 CSV"),
      file(`address,amount,label\n${a},1,标签`),
    );
    expect(await screen.findByLabelText("第 2 行地址")).toHaveValue(a);
    fireEvent.change(screen.getByLabelText("第 2 行地址"), {
      target: { value: b },
    });
    fireEvent.change(screen.getByLabelText("第 2 行金额"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("第 2 行标签"), {
      target: { value: "新标签" },
    });
    fireEvent.change(screen.getByLabelText("活动名称", { exact: false }), {
      target: { value: "活动" },
    });
    await userEvent.click(screen.getByRole("button", { name: "删除第 2 行" }));
    expect(screen.getByText("尚未添加收款人")).toBeInTheDocument();
    await userEvent.upload(
      screen.getByLabelText("导入 CSV"),
      file("", "large.csv", SETTINGS.maxFileBytes + 1),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("文件超过");
    await userEvent.click(screen.getByRole("button", { name: "关闭错误提示" }));
    await userEvent.click(screen.getByRole("button", { name: "粘贴名单" }));
    fireEvent.change(screen.getByLabelText("粘贴地址与金额"), {
      target: { value: "错误行" },
    });
    await userEvent.click(screen.getByRole("button", { name: "导入粘贴内容" }));
    expect(screen.getByRole("alert")).toHaveTextContent("需要地址");
  });
  it("distrusts backup success and verifies transaction-hash recovery against existing snapshots", async () => {
    const record = makeRecord();
    record.status = "confirmed";
    const { runtime, g } = setup({ record });
    g.executed = async () => true;
    render(<App runtime={runtime} />);
    await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
    expect(screen.getByText("还没有发放记录")).toBeInTheDocument();
    await userEvent.upload(
      screen.getByLabelText("恢复 JSON 备份"),
      file(exportBackup([record]), "backup.json"),
    );
    expect(
      await screen.findByText("结果待核验", { exact: true }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "继续查询" }));
    expect(
      await screen.findByText("已核验发放", { exact: true }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("从交易哈希恢复"), {
      target: { value: hash },
    });
    await userEvent.click(screen.getByRole("button", { name: "核验交易" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "核验交易" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "查看批次" }));
  });
  it("invalidates preflight on chain, wallet, and connection changes", async () => {
    const env = setup();
    env.runtime.wallets.push({ ...env.wallet, name: "另一钱包" });
    render(<App runtime={env.runtime} />);
    await review();
    await act(async () => env.change({ payer, chainId: 5042 }));
    expect(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    ).toBeDisabled();
    await userEvent.click(
      screen.getByRole("button", { name: "切换钱包到 Arc Testnet" }),
    );
    expect(env.wallet.switchNetwork).toHaveBeenCalledWith(5042002);
    await userEvent.click(screen.getByRole("button", { name: "切换钱包" }));
    await userEvent.click(screen.getByRole("button", { name: "另一钱包" }));
    await act(async () => env.change(undefined));
    expect(
      screen.getByRole("button", { name: "确认并在钱包中付款" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("combobox", { name: "目标网络" }));
    await userEvent.click(screen.getByRole("option", { name: "Arc Mainnet" }));
    expect(await screen.findAllByText(/尚未配置合约/)).toHaveLength(1);
  });
  it("blocks new IDs for unknown matching lists and requires explicit confirmed-history acknowledgement", async () => {
    const record = makeRecord();
    record.status = "unknown";
    const store = new TestStore();
    await store.save(record);
    const env = setup({ store });
    render(<App runtime={env.runtime} />);
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "测试钱包" }));
    await importPaste();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "复核奖励" })).toBeEnabled(),
    );
    await userEvent.click(screen.getByRole("button", { name: "复核奖励" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("结果待核验");
    record.status = "confirmed";
    await store.save(record);
    await act(async () => store.notify());
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole("button", { name: "复核奖励" }));
    expect(screen.queryByText("确认付款信息")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "复核奖励" }));
    expect(await screen.findByText("确认付款信息")).toBeInTheDocument();
  });
  it("restores actual calls by hash in a fresh browser and rejects invalid hashes", async () => {
    const env = setup();
    render(<App runtime={env.runtime} />);
    await userEvent.click(screen.getByRole("button", { name: "发放记录" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "核验交易" })).toBeEnabled(),
    );
    fireEvent.change(screen.getByLabelText("从交易哈希恢复"), {
      target: { value: "invalid" },
    });
    await userEvent.click(screen.getByRole("button", { name: "核验交易" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("交易哈希");
    fireEvent.change(screen.getByLabelText("从交易哈希恢复"), {
      target: { value: hash },
    });
    await userEvent.click(screen.getByRole("button", { name: "核验交易" }));
    expect(await screen.findByText("未命名奖励")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "查看批次" }));
    expect(screen.getByText("确认付款信息")).toBeInTheDocument();
  });
  it("shows recovered drafts and explicit storage or deployment errors", async () => {
    const store = new TestStore();
    store.draft = {
      activityName: "恢复草稿",
      rows: [{ sourceRow: 1, address: a, amount: "1", label: "" }],
    };
    const env = setup({ store });
    const view = render(<App runtime={env.runtime} />);
    expect(await screen.findByDisplayValue("恢复草稿")).toBeInTheDocument();
    view.unmount();
    const broken = new TestStore();
    vi.spyOn(broken, "list").mockRejectedValue(new Error("禁止访问"));
    const fail = setup({ store: broken, noDeployment: true, wallets: [] });
    const failView = render(<App runtime={fail.runtime} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("本地存储");
    await userEvent.click(
      within(screen.getByRole("banner")).getByRole("button", {
        name: "连接钱包",
      }),
    );
    expect(await screen.findByText("尚未检测到钱包")).toBeVisible();
    failView.unmount();
    const config = setup();
    config.g.version = async () => "bad";
    render(<App runtime={config.runtime} />);
    expect(await screen.findAllByText("合约版本不匹配")).toHaveLength(2);
  });
});
