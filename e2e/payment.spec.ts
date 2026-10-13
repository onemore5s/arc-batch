import { LANGUAGE } from "../src/i18n/core";
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { createRequire } from "node:module";
import { artifact, setup, TEST } from "./helpers";

test("local EVM: import, correction, review, payment, balances, refresh, reports, and backups", async ({
  page,
}) => {
  const { client, recipients, contract, manifest } = await setup(page);
  const before = await Promise.all(
    recipients.map((address) => client.getBalance({ address })),
  );
  await page.goto("/");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "连接钱包" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "浏览器钱包" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("导入 CSV").setInputFiles({
    name: "rewards.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      `label,amount,address\n社区贡献者,1,${recipients[1]}\n活动参与者,0,${recipients[0]}`,
    ),
  });
  await page.getByLabel("活动名称").fill("本地端到端验证");
  await expect(page.getByRole("button", { name: "复核奖励" })).toBeDisabled();
  await expect(page.getByLabel("第 3 行金额")).toHaveValue("0");
  await page.getByLabel("第 3 行金额").fill("2");
  await expect(page.getByRole("button", { name: "复核奖励" })).toBeEnabled();
  await page.getByRole("button", { name: "复核奖励" }).click();
  await expect(page.getByText("确认付款信息")).toBeVisible();
  const flow = page.getByRole("region", { name: "发放流程" });
  await expect(flow.getByRole("status")).toContainText("等待你确认付款");
  await expect(flow.locator('[aria-current="step"]')).toContainText("钱包签名");
  const roster = page.getByRole("table", { name: "收款名单" });
  const originalRows = roster.locator("tbody tr");
  await expect(originalRows.first().getByRole("rowheader")).toHaveText("2");
  await expect(originalRows.last().getByRole("rowheader")).toHaveText("3");
  expect(
    (await originalRows.first().locator("code").textContent())?.toLowerCase(),
  ).toBe(recipients[1].toLowerCase());
  await expect(
    originalRows.first().getByText("社区贡献者", { exact: true }),
  ).toBeVisible();
  await expect(roster.getByText("待付款", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/原始行/)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "确认并在钱包中付款" }),
  ).toBeEnabled();
  const frozenBatchId = await page
    .locator(".review-context code")
    .last()
    .textContent();
  let rejectedSignature = false;
  let releaseSignature: () => void = () => {};
  await page.route(TEST.rpc, async (route) => {
    const request = route.request().postDataJSON();
    if (!rejectedSignature && request.method === "eth_sendTransaction") {
      rejectedSignature = true;
      await new Promise<void>((resolve) => {
        releaseSignature = resolve;
      });
      await route.fulfill({
        json: {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: 4001, message: "User rejected the request." },
        },
      });
      return;
    }
    await route.continue();
  });
  // Reject the first signature without broadcasting; preflight again and pay using the same batch.
  await page.getByRole("button", { name: "确认并在钱包中付款" }).click();
  await expect(flow.getByRole("status")).toContainText("请在钱包中确认");
  await expect(flow).toHaveAttribute("data-mode", "active");
  await expect.poll(() => rejectedSignature).toBe(true);
  await flow.screenshot({
    path: `test-results/${test.info().project.name}-flow-signing.png`,
    animations: "disabled",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await flow
      .locator('[data-state="current"] .flow-icon')
      .evaluate(
        (element) => getComputedStyle(element, "::before").animationName,
      ),
  ).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  releaseSignature();
  await expect(
    page.getByText("已取消这次钱包签名。", { exact: true }),
  ).toBeVisible();
  expect(rejectedSignature).toBe(true);
  await expect(flow.getByRole("status")).toContainText(
    "签名已取消，可重新确认",
  );
  await expect(flow.locator('[aria-current="step"]')).toContainText("付款检查");
  expect(
    await Promise.all(
      recipients.map((address) => client.getBalance({ address })),
    ),
  ).toEqual(before);
  await page.getByRole("button", { name: "重新预检原快照" }).click();
  await expect(
    page.getByRole("button", { name: "确认并在钱包中付款" }),
  ).toBeEnabled();
  await expect(page.locator(".review-context code").last()).toHaveText(
    frozenBatchId!,
  );
  await page.getByRole("button", { name: "确认并在钱包中付款" }).click();
  const completed = page.getByRole("region", { name: "本次发放结果" });
  await expect(completed).toBeVisible();
  await expect(page.getByText("尚未添加收款人")).toBeVisible();
  await expect(page.getByLabel("活动名称")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "确认并在钱包中付款" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${test.info().project.name}-next-batch.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "手动添加" }).click();
  await page.getByLabel("第 1 行地址").fill(recipients[0]);
  await completed.getByRole("button", { name: "查看本次详情" }).click();
  await page.getByRole("button", { name: "批量发放", exact: true }).click();
  await expect(page.getByLabel("第 1 行地址")).toHaveValue(recipients[0]);
  await completed.getByRole("button", { name: "查看本次详情" }).click();
  await expect(page.getByText("已核验发放", { exact: true })).toBeVisible();
  await expect(flow).toHaveAttribute("data-mode", "complete");
  await expect(flow.locator('[aria-current="step"]')).toContainText("发放完成");
  await expect(flow.getByRole("status")).toContainText("全部收款事件已核验");
  await flow.screenshot({
    path: `test-results/${test.info().project.name}-flow-complete.png`,
    animations: "disabled",
  });
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({
    width: Math.min(...TEST.historyViewports),
    height: TEST.historyViewportHeight,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const labels = await flow.locator(".flow-step-label").all();
  for (const label of labels) {
    expect(
      await label.evaluate(
        (element) =>
          element.scrollWidth <= element.getBoundingClientRect().width,
      ),
    ).toBe(true);
  }
  await flow.screenshot({
    path: `test-results/${test.info().project.name}-flow-narrow.png`,
    animations: "disabled",
  });
  await page.setViewportSize(originalViewport);
  await expect(roster.getByText("已发放", { exact: true })).toHaveCount(2);
  await expect(originalRows.first().getByRole("rowheader")).toHaveText("2");
  const reviewWidth = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(reviewWidth.scroll).toBeLessThanOrEqual(reviewWidth.viewport);
  await expect(
    page.getByText("付款尝试记录（2 次）", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("已取消这次钱包签名。", { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByText(/Request Arguments:|User rejected the request/),
  ).toHaveCount(0);
  const after = await Promise.all(
    recipients.map((address) => client.getBalance({ address })),
  );
  expect(after[0] - before[0]).toBe(TEST.unit * 2n);
  expect(after[1] - before[1]).toBe(TEST.unit);
  expect(await client.getBalance({ address: contract })).toBe(0n);
  const reportPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出发放报告" }).click();
  expect((await reportPromise).suggestedFilename()).toContain("report");
  await page.screenshot({
    path: `test-results/${test.info().project.name}-success.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.reload();
  await page.getByRole("button", { name: "发放记录", exact: true }).click();
  await expect(page.getByText("本地端到端验证")).toBeVisible();
  const history = page.getByRole("table", { name: "本地发放记录" });
  await expect(history).toBeVisible();
  const actions = await Promise.all(
    ["查看批次", "继续查询", "导出 CSV"].map((name) =>
      history.getByRole("button", { name, exact: true }).boundingBox(),
    ),
  );
  // Regression: long IDs must not push the three actions onto separate rows.
  for (const action of actions) {
    expect(action).toBeTruthy();
    expect(action!.y).toBeCloseTo(actions[0]!.y, 0);
  }
  await page.screenshot({
    path: `test-results/${test.info().project.name}-history.png`,
    fullPage: true,
  });
  const backupPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份全部记录" }).click();
  const backup = await backupPromise;
  const backupPath = await backup.path();
  expect(backupPath).toBeTruthy();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.deleteDatabase("arc-batch");
      r.onsuccess = () => resolve();
      r.onerror = () => reject(r.error);
      r.onblocked = () => resolve();
    });
  });
  // Import in a fresh context to avoid existing IndexedDB connections blocking cleanup.
  const fresh = await page
    .context()
    .browser()!
    .newContext(test.info().project.use);
  await fresh.addInitScript(
    ({ key }) => {
      localStorage.setItem(key, "zh-CN");
    },
    { key: LANGUAGE.storageKey },
  );
  const restored = await fresh.newPage();
  await restored.route("**/deployments/e2e.json", (route) =>
    route.fulfill({ json: manifest }),
  );
  await restored.route("https://rpc.testnet.arc.io/**", async (route) => {
    const response = await route.fetch({ url: TEST.rpc });
    await route.fulfill({ response });
  });
  await restored.goto(test.info().project.use.baseURL!);
  await restored.getByRole("button", { name: "发放记录", exact: true }).click();
  await restored.getByLabel("恢复 JSON 备份").setInputFiles(backupPath!);
  await expect(restored.getByText("本地端到端验证")).toBeVisible();
  await restored.getByRole("button", { name: "继续查询", exact: true }).click();
  await expect(restored.getByText("已核验发放", { exact: true })).toBeVisible();
  const width = await restored.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.viewport);
  for (const viewportWidth of TEST.historyViewports) {
    await restored.setViewportSize({
      width: viewportWidth,
      height: TEST.historyViewportHeight,
    });
    const pageWidth = await restored.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: innerWidth,
    }));
    expect(pageWidth.scroll).toBeLessThanOrEqual(pageWidth.viewport);
    const rowActions = await Promise.all(
      ["查看批次", "继续查询", "导出 CSV"].map((name) =>
        restored.getByRole("button", { name, exact: true }).boundingBox(),
      ),
    );
    for (const action of rowActions) {
      expect(action).toBeTruthy();
      expect(action!.y).toBeCloseTo(rowActions[0]!.y, 0);
      expect(action!.x + action!.width).toBeLessThanOrEqual(viewportWidth);
    }
  }
  await restored.screenshot({
    path: `test-results/${test.info().project.name}-history-narrow.png`,
    fullPage: true,
  });
  await fresh.close();
});
test("local EVM: post-simulation rejection rolls back atomically and same-ID retry pays once", async ({
  page,
}) => {
  const { client, signer, accounts, payer, contract } = await setup(page);
  const solc: { compile: (input: string) => string } = createRequire(
    import.meta.url,
  )("solc");
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: {
          "ToggleReceiver.sol": {
            content: fs.readFileSync("e2e/fixtures/ToggleReceiver.sol", "utf8"),
          },
        },
        settings: {
          evmVersion: "paris",
          outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
        },
      }),
    ),
  );
  expect(
    compiled.errors?.filter(
      (error: { severity: string }) => error.severity === "error",
    ) ?? [],
  ).toEqual([]);
  const receiverArtifact =
    compiled.contracts["ToggleReceiver.sol"].ToggleReceiver;
  const receiverHash = await signer.deployContract({
    account: payer,
    abi: receiverArtifact.abi,
    bytecode: `0x${receiverArtifact.evm.bytecode.object}`,
  });
  const receiver = (
    await client.waitForTransactionReceipt({ hash: receiverHash })
  ).contractAddress!;
  const normal = accounts[1];
  const before = await Promise.all([
    client.getBalance({ address: normal }),
    client.getBalance({ address: receiver }),
  ]);
  let interrupted = false;
  // Change receiver state after both simulations but before broadcasting; simulation cannot guarantee execution.
  await page.route(TEST.rpc, async (route) => {
    const request = route.request().postDataJSON();
    if (
      !interrupted &&
      request.method === "eth_sendTransaction" &&
      request.params[0].to?.toLowerCase() === contract.toLowerCase()
    ) {
      interrupted = true;
      const change = await signer.writeContract({
        account: payer,
        address: receiver,
        abi: receiverArtifact.abi,
        functionName: "setRejected",
        args: [true],
      });
      await client.waitForTransactionReceipt({ hash: change });
    }
    await route.continue();
  });
  await page.goto("/");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "连接钱包" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "浏览器钱包" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("导入 CSV").setInputFiles({
    name: "rollback.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`address,amount\n${normal},1\n${receiver},1`),
  });
  await expect(page.getByRole("button", { name: "复核奖励" })).toBeEnabled();
  await page.getByRole("button", { name: "复核奖励" }).click();
  await expect(
    page.getByRole("button", { name: "确认并在钱包中付款" }),
  ).toBeEnabled();
  const batchId = await page
    .locator(".review-context code")
    .last()
    .textContent();
  await page.getByRole("button", { name: "确认并在钱包中付款" }).click();
  await expect(page.getByText("交易回滚", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("table", { name: "收款名单" })
      .getByText("未发放", { exact: true }),
  ).toHaveCount(2);
  expect(interrupted).toBe(true);
  expect(await client.getBalance({ address: normal })).toBe(before[0]);
  expect(await client.getBalance({ address: receiver })).toBe(before[1]);
  expect(await client.getBalance({ address: contract })).toBe(0n);
  expect(
    await client.readContract({
      address: contract,
      abi: artifact.abi,
      functionName: "executed",
      args: [payer, batchId],
    }),
  ).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: "发放记录", exact: true }).click();
  await expect(page.getByText("交易回滚", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看批次" }).click();
  await expect(page.locator(".review-context code").last()).toHaveText(
    batchId!,
  );
  const allow = await signer.writeContract({
    account: payer,
    address: receiver,
    abi: receiverArtifact.abi,
    functionName: "setRejected",
    args: [false],
  });
  await client.waitForTransactionReceipt({ hash: allow });
  await page
    .getByRole("banner")
    .getByRole("button", { name: "连接钱包" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "浏览器钱包" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "明确重试原批次" }).click();
  await expect(
    page.getByRole("button", { name: "确认并在钱包中付款" }),
  ).toBeEnabled();
  await expect(page.locator(".review-context code").last()).toHaveText(
    batchId!,
  );
  await page.getByRole("button", { name: "确认并在钱包中付款" }).click();
  await expect(
    page.getByRole("region", { name: "本次发放结果" }),
  ).toBeVisible();
  await expect(page.getByText("尚未添加收款人")).toBeVisible();
  expect(await client.getBalance({ address: normal })).toBe(
    before[0] + TEST.unit,
  );
  expect(await client.getBalance({ address: receiver })).toBe(
    before[1] + TEST.unit,
  );
  expect(
    await client.readContract({
      address: contract,
      abi: artifact.abi,
      functionName: "executed",
      args: [payer, batchId],
    }),
  ).toBe(true);
});

// Run the established Chinese scenarios explicitly; language.spec covers the default.
test.beforeEach(async ({ context }) => {
  await context.addInitScript(
    ({ key }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, "zh-CN");
    },
    { key: LANGUAGE.storageKey },
  );
});
