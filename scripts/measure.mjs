import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { getAddress, encodeFunctionData } from "viem";
import { AMOUNT_STEP, SETTINGS } from "../src/config.ts";
import { artifact, networkClient } from "./deployment-utils.mjs";
const file = process.argv[2];
if (!file || !process.env.ARC_MEASURE_PAYER)
  throw new Error(
    "Provide a deployment manifest and set ARC_MEASURE_PAYER to an account with enough funds for rewards and gas",
  );
const manifest = JSON.parse(fs.readFileSync(file, "utf8")),
  { client, chain } = networkClient();
if (
  (await client.getChainId()) !== manifest.chainId ||
  manifest.chainId !== chain.id
)
  throw new Error("Measurement network mismatch");
const account = getAddress(process.env.ARC_MEASURE_PAYER),
  maximum = BigInt(manifest.maxRecipients),
  block = await client.getBlock();
const counts = [1n, maximum / 2n, maximum].filter(
    (n, i, a) => n > 0n && a.indexOf(n) === i,
  ),
  measurements = [];
for (const count of counts) {
  const recipients = Array.from({ length: Number(count) }, () =>
    getAddress(`0x${randomBytes(20).toString("hex")}`),
  ).sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
  const amounts = recipients.map(() => AMOUNT_STEP),
    batchId = `0x${randomBytes(32).toString("hex")}`;
  const gas = await client.estimateGas({
    account,
    to: manifest.contractAddress,
    data: encodeFunctionData({
      abi: artifact.abi,
      functionName: "distribute",
      args: [batchId, recipients, amounts],
    }),
    value: count * AMOUNT_STEP,
  });
  const conservative =
    (gas * SETTINGS.gasNumerator + SETTINGS.gasDenominator - 1n) /
    SETTINGS.gasDenominator;
  measurements.push({
    count: count.toString(),
    gas: gas.toString(),
    conservativeGas: conservative.toString(),
    fitsBlock: conservative < block.gasLimit,
  });
}
const report = {
  chainId: manifest.chainId,
  block: block.number.toString(),
  blockGasLimit: block.gasLimit.toString(),
  measurements,
  boundary:
    "EOA recipient estimate; contract receivers have variable gas requirements. Simulate each actual batch before sending.",
};
fs.mkdirSync("deployments", { recursive: true });
fs.writeFileSync(
  `deployments/gas-${manifest.chainId}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
