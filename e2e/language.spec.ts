import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { getAddress } from "viem";
import { setup, TEST } from "./helpers";

const LANGUAGE_VIEWPORTS = [1280, 768, 320];
const VIEWPORT_HEIGHT = 900;

test("bilingual: persistent preferences, drafts, English payment and reports, narrow layouts", async ({
  page,
}, testInfo) => {
  const { client, recipients, payer, contract } = await setup(page);
  const before = await client.getBalance({ address: recipients[0] });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("ArcBatch · Batch USDC payments");
  await expect(
    page.getByRole("button", { name: "English", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Add recipient", exact: true })
    .click();
  await page.getByLabel("Batch name").fill("Community rewards");
  await page.getByLabel("Row 1 address").fill(recipients[0]);
  await page.getByLabel("Row 1 amount").fill("1");
  await page.getByLabel("Row 1 label").fill("Contributor");
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByLabel("第 1 行地址")).toHaveValue(recipients[0]);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Row 1 amount")).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "English", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("region", { name: "Total amount", exact: true })
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Browser wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Review payments", exact: true })
    .click();
  const flow = page.getByRole("region", { name: "Payment progress" });
  await expect(flow.getByRole("status")).toContainText(
    "Ready for your confirmation",
  );
  await expect(
    page.getByRole("button", { name: "Confirm in wallet", exact: true }),
  ).toBeEnabled();
  const overview = page.getByRole("group", { name: "Payment overview" });
  await expect(overview).toContainText("1 USDC");
  await expect(overview).toContainText("1 recipient");
  await expect(overview).toContainText("Arc Testnet");
  await expect(overview).toContainText(payer);
  const details = page.locator(".transaction-details");
  const contractLink = details.getByText(getAddress(contract), { exact: true });
  await expect(details).not.toHaveAttribute("open");
  await expect(contractLink).toHaveCount(1);
  await expect(contractLink).toBeHidden();
  await details.getByText("Transaction details", { exact: true }).click();
  await expect(contractLink).toBeVisible();
  await expect(details.locator(".review-context > code")).toHaveText(
    /^0x[a-f0-9]{64}$/,
  );
  await details.getByText("Transaction details", { exact: true }).click();
  for (const width of LANGUAGE_VIEWPORTS) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const label of await flow.locator(".flow-step-label").all()) {
      expect(
        await label.evaluate(
          (element) =>
            element.scrollWidth <= element.parentElement!.clientWidth,
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: `test-results/${testInfo.project.name}-english-review-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  expect(await page.locator("main").innerText()).not.toMatch(/[\u3400-\u9fff]/);
  await page
    .getByRole("button", { name: "Confirm in wallet", exact: true })
    .click();
  const result = page.getByRole("region", { name: "Payment result" });
  await expect(result).toContainText("sent to 1 recipient");
  await expect(page.getByText("No recipients yet")).toBeVisible();
  expect(await client.getBalance({ address: recipients[0] })).toBe(
    before + TEST.unit,
  );
  const download = page.waitForEvent("download");
  await result
    .getByRole("button", { name: "Export report", exact: true })
    .click();
  const csv = await fs.readFile((await (await download).path())!, "utf8");
  expect(csv).toContain("Paid (verified onchain)");
  expect(csv).toContain("Community rewards");
  expect(csv).toContain(recipients[0]);
  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(
    page.getByText("Verified payment", { exact: true }),
  ).toBeVisible();
  expect(await page.locator("main").innerText()).not.toMatch(/[\u3400-\u9fff]/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Guide", exact: true }).click();
  expect(await page.locator("main").innerText()).not.toMatch(/[\u3400-\u9fff]/);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.setViewportSize({
    width: LANGUAGE_VIEWPORTS[0],
    height: VIEWPORT_HEIGHT,
  });
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-english-complete.png`,
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "简体中文", exact: true }).click();
  await expect(result).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "本次发放结果" }),
  ).toContainText("已发放至 1 位收款人");
});
