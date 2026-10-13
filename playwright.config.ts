import { defineConfig, devices } from "@playwright/test";
import { NETWORKS, SETTINGS } from "./src/config";
const port = Number(process.env.ARC_E2E_PORT ?? SETTINGS.devPort);
export default defineConfig({
  testDir: "e2e",
  testIgnore: "**/appkit.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "Desktop Chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "Mobile Chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: `node scripts/foundry.mjs anvil --silent --port 8545 --chain-id ${NETWORKS.testnet.id}`,
      url: "http://127.0.0.1:8545",
      reuseExistingServer: false,
    },
    {
      command: `npm run dev -- --port ${port} --strictPort`,
      env: {
        VITE_DEPLOYMENT_FILE: "e2e.json",
        VITE_REOWN_PROJECT_ID: "",
        ARC_VITE_CACHE_DIR: "node_modules/.vite-e2e",
      },
      url: `http://127.0.0.1:${port}`,
      reuseExistingServer: false,
    },
  ],
});
