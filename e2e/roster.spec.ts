import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { setup } from "./helpers";

const VIEWPORTS = [1280, 320];
const VIEWPORT_HEIGHT = 900;

test("名单导入：模板下载、字段提示、中英切换与窄屏布局", async ({
  page,
}, testInfo) => {
  const { recipients } = await setup(page);
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "CSV format example" }),
  ).toBeVisible();
  const pendingDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download template" }).click();
  const download = await pendingDownload;
  expect(download.suggestedFilename()).toBe("ArcBatch-recipients-template.csv");
  const template = await fs.readFile((await download.path())!, "utf8");
  expect(template).toBe(
    "address,amount,label\r\n<recipient_address>,<amount_usdc>,<optional_label>\r\n",
  );
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await expect(page.getByRole("button", { name: "下载模板" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-roster-empty-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "手动添加" }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  await page.getByLabel("第 1 行地址").fill("wrong");
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  await page.getByLabel("第 1 行金额").click();
  await expect(page.getByLabel("第 1 行地址")).toHaveAccessibleDescription(
    "钱包地址或校验和无效",
  );
  await page.getByLabel("第 1 行金额").fill("wrong");
  await page.getByLabel("第 1 行标签").click();
  await expect(page.getByLabel("第 1 行金额")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  for (const width of VIEWPORTS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-roster-errors-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByLabel("Row 1 amount")).toHaveAccessibleDescription(
    "Use a positive decimal amount with up to 6 decimal places",
  );
  expect(await page.locator("main").innerText()).not.toMatch(/[\u3400-\u9fff]/);
  await page.getByLabel("Import CSV").setInputFiles({
    name: "template.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(template),
  });
  await expect(page.getByLabel("Row 2 address")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByLabel("Row 2 amount")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  const completed = template
    .replace("<recipient_address>", recipients[0])
    .replace("<amount_usdc>", "1.25")
    .replace("<optional_label>", "");
  await page.getByLabel("Import CSV").setInputFiles({
    name: "completed.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(completed),
  });
  await expect(page.getByLabel("Row 2 address")).toHaveValue(recipients[0]);
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Browser wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Review payments" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Add recipient", exact: true })
    .click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review payments" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Cleared 2 rows");
  await expect(
    page.getByRole("button", { name: "Undo", exact: true }),
  ).toBeFocused();
  await expect(page.getByText("No recipients yet")).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Row 2 address")).toHaveValue(recipients[0]);
  await expect(page.getByLabel("Row 2 amount")).toHaveValue("1.25");
  await expect(page.getByLabel("Row 3 address")).toHaveValue("");
  await page.setViewportSize({ width: 846, height: VIEWPORT_HEIGHT });
  await expect(
    page.getByRole("columnheader", { name: "Row number" }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-clear-roster-846.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Delete row 3" }).click();
  await page.getByRole("button", { name: "Review payments" }).click();
  await expect(
    page.getByRole("heading", { name: "Review payment", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm in wallet" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Clear all", exact: true }),
  ).toHaveCount(0);
});
