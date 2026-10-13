import fs from "node:fs";
import { spawn } from "node:child_process";
import { keccak256 } from "viem";
import { SETTINGS, PROTOCOL } from "../src/config.ts";
import { queryFees } from "../src/chain/fees.ts";
import {
  artifact,
  networkClient,
  constructorData,
  verifyManifest,
} from "./deployment-utils.mjs";
const { network, chain, client } = networkClient();
const maximum = process.env.ARC_MAX_RECIPIENTS;
if (
  !maximum ||
  !/^[1-9]\d*$/.test(maximum) ||
  BigInt(maximum) > BigInt(Number.MAX_SAFE_INTEGER)
)
  throw new Error(
    "Set ARC_MAX_RECIPIENTS to a positive integer validated by gas measurements",
  );
if ((await client.getChainId()) !== chain.id)
  throw new Error("Target RPC chainId mismatch; deployment refused");
const data = constructorData(maximum),
  gas = await client.estimateGas({ data }),
  fees = await queryFees(client);
const gasLimit =
  (gas * SETTINGS.gasNumerator + SETTINGS.gasDenominator - 1n) /
  SETTINGS.gasDenominator;
const plan = {
  status: "prepared",
  chainId: chain.id,
  maxRecipients: maximum,
  compiler: artifact.compiler,
  evmVersion: artifact.evmVersion,
  version: PROTOCOL.version,
  sourceHash: artifact.sourceHash,
  gasLimit: gasLimit.toString(),
  maxFeePerGas: fees.maxFeePerGas.toString(),
  requiredGasBalance: (gasLimit * fees.maxFeePerGas).toString(),
};
fs.mkdirSync("deployments", { recursive: true });
fs.writeFileSync(
  `deployments/${network}-plan.json`,
  JSON.stringify(plan, null, 2) + "\n",
);
console.log("Deployment plan saved:", `deployments/${network}-plan.json`);
if (!process.argv.includes("--broadcast")) {
  console.log(
    "Not broadcast. Review the plan, set ARC_KEYSTORE_ACCOUNT to an encrypted keystore, and add --broadcast.",
  );
  process.exit(0);
}
if (!process.env.ARC_KEYSTORE_ACCOUNT)
  throw new Error(
    "Broadcasting requires ARC_KEYSTORE_ACCOUNT; enter its password interactively",
  );
const args = [
  "scripts/foundry.mjs",
  "cast",
  "send",
  "--rpc-url",
  chain.rpcUrls.default.http[0],
  "--chain",
  String(chain.id),
  "--account",
  process.env.ARC_KEYSTORE_ACCOUNT,
  "--gas-limit",
  gasLimit.toString(),
  "--gas-price",
  fees.maxFeePerGas.toString(),
  "--priority-gas-price",
  fees.maxPriorityFeePerGas.toString(),
  "--json",
  "--create",
  data,
];
const child = spawn(process.execPath, args, {
  stdio: ["inherit", "pipe", "inherit"],
});
let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
const exit = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("exit", resolve);
});
if (exit !== 0)
  throw new Error(
    "Deployment broadcast did not complete; check onchain results before retrying",
  );
const sent = JSON.parse(output),
  hash = sent.transactionHash;
if (!hash)
  throw new Error(
    "No deployment transaction hash returned; check the wallet history",
  );
const receipt = await client.getTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress)
  throw new Error("Deployment reverted");
const code = await client.getCode({ address: receipt.contractAddress });
const manifest = {
  chainId: chain.id,
  contractAddress: receipt.contractAddress,
  deploymentBlock: receipt.blockNumber.toString(),
  transactionHash: hash,
  maxRecipients: maximum,
  version: PROTOCOL.version,
  compiler: artifact.compiler,
  evmVersion: artifact.evmVersion,
  sourceHash: artifact.sourceHash,
  runtimeCodeHash: keccak256(code),
  abiSource: "artifacts/distributor.json",
};
await verifyManifest(manifest, client);
fs.mkdirSync("public/deployments", { recursive: true });
fs.writeFileSync(
  `public/deployments/${network}.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Deployed and verified:", receipt.contractAddress, hash);
