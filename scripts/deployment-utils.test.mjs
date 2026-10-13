import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { keccak256 } from "viem";
import { NETWORKS } from "../src/config.ts";
import {
  artifact,
  constructorData,
  verifyManifest,
} from "./deployment-utils.mjs";

// 保留 Prague 字节码验证编译目标差异，交易元数据使用合成测试值。
const observed = JSON.parse(
  fs.readFileSync(
    new URL("./fixtures/testnet-deployment-prague.json", import.meta.url),
    "utf8",
  ),
);

function fixture(changes = {}) {
  const manifest = {
    chainId: NETWORKS.testnet.id,
    contractAddress: observed.report.contractAddress,
    deploymentBlock: observed.report.deploymentBlock,
    transactionHash: observed.transaction.hash,
    maxRecipients: observed.report.maxRecipients,
    version: observed.report.version,
    compiler: artifact.compiler,
    evmVersion: "prague",
    sourceHash: artifact.sourceHash,
    runtimeCodeHash: keccak256(observed.runtimeCode),
    abiSource: "artifacts/distributor.json",
    ...changes,
  };
  const client = {
    getChainId: async () => NETWORKS.testnet.id,
    getTransaction: async () => ({ ...observed.transaction }),
    getTransactionReceipt: async () => ({
      status: "success",
      contractAddress: observed.report.contractAddress,
      blockNumber: BigInt(observed.report.deploymentBlock),
    }),
    getCode: async () => observed.runtimeCode,
    readContract: async ({ functionName }) =>
      functionName === "version"
        ? observed.report.version
        : BigInt(observed.report.maxRecipients),
  };
  return { manifest, client };
}

test("使用合成交易元数据验证 Prague 部署输入、回执和运行时字节码", async () => {
  const { manifest, client } = fixture();
  assert.equal(await verifyManifest(manifest, client), true);
});

test("rejects a Prague deployment declared as Paris", async () => {
  const { manifest, client } = fixture({ evmVersion: artifact.evmVersion });
  await assert.rejects(
    verifyManifest(manifest, client),
    /Deployment transaction or constructor arguments failed verification/,
  );
});

test("rejects modified constructor arguments", async () => {
  const { manifest, client } = fixture({ maxRecipients: "1" });
  await assert.rejects(
    verifyManifest(manifest, client),
    /Deployment transaction or constructor arguments failed verification/,
  );
});

test("rejects modified deployment input", async () => {
  const { manifest, client } = fixture();
  client.getTransaction = async () => ({
    ...observed.transaction,
    input: observed.transaction.input.slice(0, -2) + "03",
  });
  await assert.rejects(
    verifyManifest(manifest, client),
    /Deployment transaction or constructor arguments failed verification/,
  );
});

test("rejects a mismatched runtime code hash", async () => {
  const { manifest, client } = fixture();
  client.getCode = async () => "0x00";
  await assert.rejects(
    verifyManifest(manifest, client),
    /Deployment code, version, or build artifact mismatch/,
  );
});

test("rejects compiler, source hash, and onchain version mismatches", async () => {
  for (const changes of [
    { compiler: "invalid compiler" },
    { sourceHash: `0x${"0".repeat(64)}` },
    { version: "invalid version" },
  ]) {
    const { manifest, client } = fixture(changes);
    await assert.rejects(
      verifyManifest(manifest, client),
      /Deployment code, version, or build artifact mismatch/,
    );
  }
});

test("rejects a network mismatch", async () => {
  const { manifest, client } = fixture();
  client.getChainId = async () => NETWORKS.mainnet.id;
  await assert.rejects(
    verifyManifest(manifest, client),
    /RPC chainId mismatch/,
  );
});

test("rejects unsupported EVM targets", () => {
  assert.throws(
    () => constructorData("2", "unknown target"),
    /Unsupported EVM compilation target/,
  );
});
