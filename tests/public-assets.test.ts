import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPublicAssets } from "../scripts/public-assets";
import { SETTINGS } from "../src/config";
import manifest from "../public/deployments/mainnet.json";

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
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true });
});

describe("Public deployment boundary", () => {
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
  it.each(["VITE_PRIVATE_KEY", "VITE_REOWN_PROJECT_ID_SECRET"])(
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
