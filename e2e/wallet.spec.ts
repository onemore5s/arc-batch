import { LANGUAGE } from "../src/i18n/core";
import { test, expect } from "@playwright/test";
import { NETWORKS, WALLET_UI } from "../src/config";
import { payer } from "../tests/fixtures";

// Wallet names and icons are isolated browser fixtures, never a production wallet catalog.
const TEST_WALLETS = [
  { name: "Alpha Wallet", letter: "A", color: "#2f578c" },
  { name: "Beta Wallet", letter: "B", color: "#467f84" },
  { name: "Gamma Wallet", letter: "G", color: "#78623b" },
  { name: "Delta Wallet", letter: "D", color: "#73568e" },
  { name: "Epsilon Wallet", letter: "E", color: "#397255" },
  { name: "Zeta Wallet", letter: "Z", color: "#925747" },
];
const NARROW_VIEWPORT = { width: 320, height: 568 };

test("wallet dialog: discovery, focus, search, rejection recovery, and mobile scrolling", async ({
  page,
}, testInfo) => {
  await page.route("https://rpc.testnet.arc.io/**", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      json: { jsonrpc: "2.0", id: request.id, result: "0x0" },
    });
  });
  await page.addInitScript(
    ({ wallets, chainId, account, rejectedCode }) => {
      const providers = wallets.map(({ name, letter, color }) => {
        let rejected = false;
        const icon = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="${color}"/><text x="16" y="22" text-anchor="middle" font-family="sans-serif" font-size="20" fill="white">${letter}</text></svg>`)}`;
        return {
          info: { name, icon },
          provider: {
            request: async ({ method }: { method: string }) => {
              if (method === "eth_requestAccounts" && !rejected) {
                rejected = true;
                throw { code: rejectedCode };
              }
              return method === "eth_chainId" ? chainId : [account];
            },
          },
        };
      });
      window.addEventListener("eip6963:requestProvider", () => {
        providers.forEach((detail) =>
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", { detail }),
          ),
        );
      });
    },
    {
      wallets: TEST_WALLETS,
      chainId: `0x${NETWORKS.testnet.id.toString(16)}`,
      account: payer,
      rejectedCode: WALLET_UI.rejectedCode,
    },
  );
  await page.goto("/");
  const trigger = page
    .getByRole("banner")
    .getByRole("button", { name: "连接钱包" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "连接钱包" });
  await expect(dialog.getByRole("heading")).toBeFocused();
  await expect(dialog.getByText("已安装", { exact: true })).toHaveCount(
    TEST_WALLETS.length,
  );
  await expect(dialog.getByRole("img")).toHaveCount(TEST_WALLETS.length);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-wallet-dialog.png`,
  });
  await dialog.getByRole("button", { name: "关闭钱包选择" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Zeta Wallet" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "关闭钱包选择" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await dialog.getByRole("searchbox").fill("beta");
  await expect(
    dialog.getByRole("button", { name: "Alpha Wallet" }),
  ).toHaveCount(0);
  await dialog.getByRole("button", { name: "Beta Wallet" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(WALLET_UI.rejectedMessage);
  await dialog.getByRole("button", { name: "Beta Wallet" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "切换钱包" }).click();
  await expect(
    dialog.getByRole("button", { name: "Beta Wallet" }),
  ).toContainText("已连接");
  await page.setViewportSize(NARROW_VIEWPORT);
  await dialog
    .getByRole("button", { name: "Zeta Wallet" })
    .scrollIntoViewIfNeeded();
  await expect(
    dialog.getByRole("button", { name: "Zeta Wallet" }),
  ).toBeInViewport();
  await expect(page.locator(".wallet-dialog-footer")).toBeInViewport();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(NARROW_VIEWPORT.height);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-wallet-dialog-narrow.png`,
  });
});

test("provides dismissible installation guidance when no wallet is found", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "连接钱包" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("尚未检测到钱包")).toBeVisible();
  await expect(dialog.getByRole("searchbox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭钱包选择" }).click();
  await expect(dialog).toHaveCount(0);
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
