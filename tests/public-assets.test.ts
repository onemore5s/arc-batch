import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicAssets } from "../scripts/public-assets";
import { SETTINGS } from "../src/config";
import manifest from "../public/deployments/mainnet.json";
import testnetManifest from "../public/deployments/testnet.json";

const roots: string[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "arc-public-assets-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, "deployments"));
  fs.writeFileSync(path.join(root, SETTINGS.logoPath), "<svg/>");
  fs.writeFileSync(
    path.join(root, "deployments/mainnet.json"),
    JSON.stringify(manifest),
  );
  fs.writeFileSync(
    path.join(root, "deployments/testnet.json"),
    JSON.stringify(testnetManifest),
  );
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true });
});

describe("Public deployment boundary", () => {
  it("只公开显式配置的主网和测试网清单，保留顺序并兼容旧配置", () => {
    const root = fixture();
    fs.writeFileSync(
      path.join(root, "deployments/private.json"),
      "private fixture",
    );
    const assets = createPublicAssets(
      {
        VITE_DEPLOYMENT_FILES: "mainnet.json, testnet.json",
        VITE_DEPLOYMENT_FILE: "ignored-legacy.json",
      },
      root,
    );
    expect(assets.map((asset) => asset.fileName)).toEqual([
      SETTINGS.logoPath.slice(1),
      "deployments/mainnet.json",
      "deployments/testnet.json",
    ]);
    expect(JSON.parse(String(assets[2].source))).toEqual(testnetManifest);
  });
  it.each([
    "",
    "mainnet.json,",
    "mainnet.json,../private.json",
    "mainnet.json,mainnet.json",
  ])("拒绝无效的多清单配置：%s", (selection) => {
    expect(() =>
      createPublicAssets({ VITE_DEPLOYMENT_FILES: selection }, fixture()),
    ).toThrow();
  });
  it.each(["missing", "extra-field", "duplicate-chain", "unsupported-chain"])(
    "额外清单异常时停止发布：%s",
    (problem) => {
      const root = fixture();
      const file = path.join(root, "deployments/testnet.json");
      if (problem === "missing") fs.rmSync(file);
      else
        fs.writeFileSync(
          file,
          JSON.stringify({
            ...testnetManifest,
            ...(problem === "extra-field"
              ? { privateNote: "private fixture" }
              : {}),
            ...(problem === "duplicate-chain"
              ? { chainId: manifest.chainId }
              : {}),
            ...(problem === "unsupported-chain" ? { chainId: 1 } : {}),
          }),
        );
      expect(() =>
        createPublicAssets(
          { VITE_DEPLOYMENT_FILES: "mainnet.json,testnet.json" },
          root,
        ),
      ).toThrow();
    },
  );
  it("accepts Vercel platform metadata without including it in public assets", () => {
    const marker = "private-build-author-fixture";
    const assets = createPublicAssets(
      {
        VITE_DEPLOYMENT_FILE: "mainnet.json",
        VITE_VERCEL_ENV: "preview",
        VITE_VERCEL_GIT_COMMIT_AUTHOR_NAME: marker,
      },
      fixture(),
    );
    expect(assets.map((asset) => String(asset.source)).join("")).not.toContain(
      marker,
    );
  });
  it("publishes only the logo and selected validated manifest", () => {
    const root = fixture();
    for (const name of [".env", "backup.csv", "README.md", "private.json"])
      fs.writeFileSync(path.join(root, name), "private fixture");
    fs.writeFileSync(
      path.join(root, "deployments/testnet.json"),
      "unselected fixture",
    );
    const assets = createPublicAssets(
      {
        VITE_DEPLOYMENT_FILE: "mainnet.json",
        VITE_REOWN_PROJECT_ID: "a".repeat(32),
        BASE_URL: "/",
      },
      root,
    );
    expect(assets.map((asset) => asset.fileName).sort()).toEqual(
      [SETTINGS.logoPath.slice(1), "deployments/mainnet.json"].sort(),
    );
    expect(
      JSON.parse(
        String(
          assets.find((asset) => asset.fileName.endsWith(".json"))!.source,
        ),
      ),
    ).toEqual(manifest);
  });
  it.each([undefined, "", "../private.json", "nested/file.json", "secret.env"])(
    "rejects missing or unsafe manifest selection: %s",
    (file) => {
      expect(() =>
        createPublicAssets({ VITE_DEPLOYMENT_FILE: file }, fixture()),
      ).toThrow();
    },
  );
  it.each([
    "VITE_PRIVATE_KEY",
    "VITE_REOWN_PROJECT_ID_SECRET",
    "VITE_DEPLOYMENT_FILES_SECRET",
  ])(
    "rejects unexpected public variable %s without exposing its value",
    (key) => {
      const value = "synthetic-sensitive-fixture";
      let message = "";
      try {
        createPublicAssets(
          { VITE_DEPLOYMENT_FILE: "mainnet.json", [key]: value },
          fixture(),
        );
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain(key);
      expect(message).not.toContain(value);
    },
  );
  it("rejects extra manifest fields instead of publishing them", () => {
    const root = fixture();
    fs.writeFileSync(
      path.join(root, "deployments/mainnet.json"),
      JSON.stringify({ ...manifest, privateNote: "private fixture" }),
    );
    expect(() =>
      createPublicAssets({ VITE_DEPLOYMENT_FILE: "mainnet.json" }, root),
    ).toThrow();
  });
});
