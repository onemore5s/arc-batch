import { test, expect } from "@playwright/test";
import { getAddress } from "viem";
import { setup } from "./helpers";

const COPY_VIEWPORTS = [1280, 320];
const COPY_VIEWPORT_HEIGHT = 1000;

test("copy controls: complete review/history values, feedback, and mobile layout", async ({
  page,
  context,
}, testInfo) => {
  const { recipients, manifest } = await setup(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await page
    .getByRole("banner")
    .getByRole("button", { name: "连接钱包" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "浏览器钱包" })
    .click();
  await page.getByRole("button", { name: "手动添加" }).click();
  await page.getByLabel("第 1 行地址").fill(recipients[0]);
  await page.getByLabel("第 1 行金额").fill("1");
  await page.getByRole("button", { name: "复核奖励" }).click();
  await expect(
    page.getByRole("button", { name: "确认并在钱包中付款" }),
  ).toBeEnabled();
  const payer = (await page
    .locator(".review-overview .address-value code")
    .textContent())!;
  const batchId = (await page.locator(".review-context > code").textContent())!;
  const recipient = (await page
    .locator(".review-roster .address-value code")
    .textContent())!;
  for (const value of [payer, recipient]) {
    const button = page.getByRole("button", {
      name: `复制 ${value}`,
      exact: true,
    });
    await expect(button).toHaveText("");
    await button.click();
    await expect(button).toHaveAttribute("title", "已复制");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(value);
  }
  for (const width of COPY_VIEWPORTS) {
    await page.setViewportSize({ width, height: COPY_VIEWPORT_HEIGHT });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: `复制 ${recipient}`, exact: true })
      .click();
    await page.locator(".workspace").screenshot({
      path: `test-results/${testInfo.project.name}-copy-review-${width}.png`,
    });
  }
  await page.getByRole("button", { name: "发放记录", exact: true }).click();
  for (const [label, value] of [
    ["批次 ID", batchId],
    ["付款钱包", payer],
    ["合约地址", getAddress(manifest.contractAddress)],
  ]) {
    const button = page.getByRole("button", {
      name: `复制${label} ${value}`,
      exact: true,
    });
    await expect(button).toHaveText("");
    await button.click();
    await expect(button).toHaveAttribute("title", "已复制");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(value);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "English", exact: true }).click();
  const englishCopy = page.getByRole("button", {
    name: `Copy Batch ID ${batchId}`,
    exact: true,
  });
  await englishCopy.click();
  await expect(englishCopy).toHaveAttribute("title", "Copied");
});
