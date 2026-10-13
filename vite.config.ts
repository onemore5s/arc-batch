import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import {
  PUBLIC_ENV_KEYS,
  publicAssetsPlugin,
} from "./scripts/public-assets.ts";
export default defineConfig({
  envPrefix: PUBLIC_ENV_KEYS,
  plugins: [react(), publicAssetsPlugin()],
  cacheDir: process.env.ARC_VITE_CACHE_DIR,
  build: {
    copyPublicDir: false,
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules\/(react|react-dom|scheduler)\//,
            },
            {
              name: "evm",
              test: /node_modules\/(viem|ox|@noble|@scure|abitype)\//,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
    setupFiles: ["tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**", "src/main.tsx"],
      reporter: ["text", "json-summary", "json", "html"],
      thresholds: { statements: 97, branches: 97, functions: 97, lines: 97 },
    },
  },
});
