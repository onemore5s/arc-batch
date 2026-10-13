import { defineConfig } from "@playwright/test";
import { loadEnv } from "vite";
import base from "./playwright.config";
import { REOWN } from "./src/config";

const projectId = loadEnv("development", process.cwd()).VITE_REOWN_PROJECT_ID;
if (!projectId || !REOWN.projectIdPattern.test(projectId))
  throw new Error("AppKit browser tests require a valid VITE_REOWN_PROJECT_ID");

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/appkit.spec.ts",
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map(
    (server) =>
      server.env
        ? {
            ...server,
            env: { ...server.env, VITE_REOWN_PROJECT_ID: projectId },
          }
        : server,
  ),
});
