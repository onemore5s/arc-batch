import fs from "node:fs";
import path from "node:path";
import { loadEnv, type Plugin } from "vite";
import { SETTINGS } from "../src/config.ts";
import {
  deploymentFiles,
  parseDeployments,
} from "../src/domain/deployments.ts";

export const PUBLIC_ENV_KEYS = [
  "VITE_DEPLOYMENT_FILE",
  "VITE_DEPLOYMENT_FILES",
  "VITE_REOWN_PROJECT_ID",
];
type PublicAsset = { fileName: string; source: string | Buffer };

export function createPublicAssets(
  env: Record<string, unknown>,
  publicDir: string,
): PublicAsset[] {
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("VITE_") &&
      !key.startsWith("VITE_VERCEL_") &&
      !PUBLIC_ENV_KEYS.includes(key)
    )
      throw new Error(`Unexpected public environment variable: ${key}`);
  }
  const files = deploymentFiles(
    env.VITE_DEPLOYMENT_FILES ?? env.VITE_DEPLOYMENT_FILE,
  );
  let deployments;
  try {
    deployments = parseDeployments(
      files.map((file) =>
        JSON.parse(
          fs.readFileSync(path.join(publicDir, "deployments", file), "utf8"),
        ),
      ),
    );
  } catch {
    throw new Error("Invalid or unavailable public deployment manifests");
  }
  const logo = SETTINGS.logoPath.slice(1);
  return [
    { fileName: logo, source: fs.readFileSync(path.join(publicDir, logo)) },
    ...deployments.map((deployment, index) => ({
      fileName: `deployments/${files[index]}`,
      source: JSON.stringify(deployment, null, 2) + "\n",
    })),
  ];
}

export function publicAssetsPlugin(): Plugin {
  let assets: PublicAsset[];
  return {
    name: "arc-public-assets",
    apply: "build",
    configResolved(config) {
      if (!config.publicDir)
        throw new Error("Public asset directory is required");
      assets = createPublicAssets(
        loadEnv(config.mode, config.envDir, "VITE_"),
        config.publicDir,
      );
    },
    generateBundle() {
      for (const asset of assets) this.emitFile({ type: "asset", ...asset });
    },
  };
}
