import type { Page } from "@playwright/test";
import { createPublicClient, createWalletClient, http, keccak256 } from "viem";
import fs from "node:fs";
export const artifact = JSON.parse(
  fs.readFileSync("artifacts/distributor.json", "utf8"),
);
import { NETWORKS, PROTOCOL } from "../src/config";
export const TEST = {
  rpc: "http://127.0.0.1:8545",
  maxRecipients: 3n,
  unit: 10n ** 18n,
  historyViewports: [960, 768, 320],
  historyViewportHeight: 780,
};
export async function setup(page: Page, announce = false) {
  const client = createPublicClient({
      chain: NETWORKS.testnet,
      transport: http(TEST.rpc),
    }),
    signer = createWalletClient({
      chain: NETWORKS.testnet,
      transport: http(TEST.rpc),
    });
  const accounts = await signer.getAddresses(),
    payer = accounts[0],
    recipients = [accounts[1], accounts[2]].sort((a, b) =>
      BigInt(a) < BigInt(b) ? -1 : 1,
    );
  const deployHash = await signer.deployContract({
    account: payer,
    abi: artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args: [TEST.maxRecipients],
  });
  const deployReceipt = await client.waitForTransactionReceipt({
      hash: deployHash,
    }),
    contract = deployReceipt.contractAddress!;
  const manifest = {
    chainId: NETWORKS.testnet.id,
    contractAddress: contract,
    deploymentBlock: deployReceipt.blockNumber.toString(),
    transactionHash: deployHash,
    maxRecipients: TEST.maxRecipients.toString(),
    version: PROTOCOL.version,
    compiler: artifact.compiler,
    evmVersion: artifact.evmVersion,
    sourceHash: artifact.sourceHash,
    runtimeCodeHash: keccak256((await client.getCode({ address: contract }))!),
    abiSource: "artifacts/distributor.json",
  };
  await page.route("**/deployments/e2e.json", (route) =>
    route.fulfill({ json: manifest }),
  );
  await page.route("https://rpc.testnet.arc.io/**", async (route) => {
    const response = await route.fetch({ url: TEST.rpc });
    await route.fulfill({ response });
  });
  await page.addInitScript(
    ({ rpc, announce }) => {
      const listeners = new Map<string, Set<() => void>>();
      const provider = {
        request: async ({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) => {
          if (method === "eth_requestAccounts") {
            sessionStorage.setItem("test-wallet-authorized", "true");
            method = "eth_accounts";
          }
          if (method === "wallet_revokePermissions") {
            sessionStorage.removeItem("test-wallet-authorized");
            return null;
          }
          if (
            announce &&
            method === "eth_accounts" &&
            !sessionStorage.getItem("test-wallet-authorized")
          )
            return [];
          const response = await fetch(rpc, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method,
              params: params ?? [],
            }),
          });
          const json = await response.json();
          if (json.error) throw json.error;
          return json.result;
        },
        on: (event: string, callback: () => void) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(callback);
        },
        removeListener: (event: string, callback: () => void) =>
          listeners.get(event)?.delete(callback),
      };
      Object.assign(window, { ethereum: provider });
      if (!announce) return;
      const detail = {
        info: {
          uuid: "eea41a41-b686-4a88-94cd-b3593b3f7ed0",
          name: "本地测试钱包",
          rdns: "test.arc-batch.wallet",
          icon:
            "data:image/svg+xml," +
            encodeURIComponent(
              '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="8" fill="#1b3158"/></svg>',
            ),
        },
        provider,
      };
      window.addEventListener("eip6963:requestProvider", () =>
        window.dispatchEvent(
          new CustomEvent("eip6963:announceProvider", { detail }),
        ),
      );
    },
    { rpc: TEST.rpc, announce },
  );
  return { client, signer, accounts, payer, recipients, contract, manifest };
}
