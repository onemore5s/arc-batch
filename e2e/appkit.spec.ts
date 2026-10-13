import { LANGUAGE } from "../src/i18n/core";
import { test, expect } from "@playwright/test";
import { setup, TEST } from "./helpers";

test("AppKit: local wallet connection, verified payment, reconnect, and disconnection", async ({
  page,
}) => {
  const { client, recipients } = await setup(page, true);
  const before = await client.getBalance({ address: recipients[0] });
  await page.goto("/");
  await page
    .getByRole("region", { name: "发放合计", exact: true })
    .getByRole("button", { name: "连接钱包" })
    .click();
  await page.getByText("本地测试钱包", { exact: true }).click();
  await expect(page.getByRole("button", { name: "切换钱包" })).toBeVisible();
  await expect(
    page.getByText("Connect Wallet", { exact: true }),
  ).not.toBeVisible();
  await page.getByLabel("导入 CSV").setInputFiles({
    name: "appkit.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`address,amount\n${recipients[0]},1`),
  });
  await page.getByRole("button", { name: "复核奖励" }).click();
  await expect(
    page.getByRole("button", { name: "确认并在钱包中付款" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "确认并在钱包中付款" }).click();
  await expect(
    page.getByRole("region", { name: "本次发放结果" }),
  ).toBeVisible();
  await expect(page.getByText("尚未添加收款人")).toBeVisible();
  expect(await client.getBalance({ address: recipients[0] })).toBe(
    before + TEST.unit,
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "切换钱包" })).toBeVisible();
  await page.getByRole("button", { name: "切换钱包" }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(
    page.getByRole("banner").getByRole("button", { name: "连接钱包" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "发放合计", exact: true })
      .getByRole("button", { name: "连接钱包" }),
  ).toBeEnabled();
});

test("AppKit: wallet catalog, QR entry, and mobile layout", async ({
  page,
}, testInfo) => {
  await setup(page, true);
  await page.goto("/");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "连接钱包" })
    .click();
  await expect(page.getByText("本地测试钱包", { exact: true })).toBeVisible();
  if (testInfo.project.use.isMobile) {
    await page.getByRole("button", { name: /Search Wallet/ }).click();
    const search = page.getByRole("searchbox", { name: "Search wallet" });
    await expect(search).toBeInViewport();
    await search.fill("MetaMask");
    await expect(page.getByText("MetaMask", { exact: true })).toBeInViewport();
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-appkit-search.png`,
    });
    return;
  }
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-appkit-connect.png`,
  });
  await page.getByText("WalletConnect", { exact: true }).click();
  await expect(page.locator("wui-qr-code")).toBeVisible();
  const uri = await page.locator("wui-qr-code").getAttribute("uri");
  expect(uri).toMatch(/^wc:/);
  const bounds = await page.locator("wui-qr-code").boundingBox();
  expect(bounds).toBeTruthy();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
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
