import fs from "node:fs";
import path from "node:path";
import { loadEnv, type Plugin } from "vite";
import { SETTINGS } from "../src/config.ts";
import { deploymentSchema } from "../src/domain/schema.ts";

export const PUBLIC_ENV_KEYS = [
  "VITE_DEPLOYMENT_FILE",
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
  const file = env.VITE_DEPLOYMENT_FILE;
  if (
    typeof file !== "string" ||
    !/^[\w.-]+\.json$/.test(file) ||
    file.includes("..")
  )
    throw new Error(
      "Set VITE_DEPLOYMENT_FILE to a verified deployment filename before building",
    );
  const fileName = `deployments/${file}`;
  let deployment;
  try {
    deployment = deploymentSchema.parse(
      JSON.parse(fs.readFileSync(path.join(publicDir, fileName), "utf8")),
    );
  } catch {
    throw new Error(
      `Invalid or unavailable public deployment manifest: ${fileName}`,
    );
  }
  const logo = SETTINGS.logoPath.slice(1);
  return [
    { fileName: logo, source: fs.readFileSync(path.join(publicDir, logo)) },
    { fileName, source: JSON.stringify(deployment, null, 2) + "\n" },
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
