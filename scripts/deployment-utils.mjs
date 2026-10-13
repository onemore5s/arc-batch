import fs from "node:fs";
import solc from "solc";
import { createPublicClient, http, encodeDeployData, keccak256 } from "viem";
import { COMPILATION, NETWORKS, SETTINGS, PROTOCOL } from "../src/config.ts";
export const artifact = JSON.parse(
  fs.readFileSync("artifacts/distributor.json", "utf8"),
);
const bytecodes = new Map([[artifact.evmVersion, artifact.bytecode]]);
export function networkClient() {
  const network = process.env.ARC_NETWORK;
  if (!Object.hasOwn(NETWORKS, network ?? ""))
    throw new Error("Set ARC_NETWORK to mainnet or testnet");
  const chain = NETWORKS[network];
  return {
    network,
    chain,
    client: createPublicClient({
      chain,
      transport: http(chain.rpcUrls.default.http[0], {
        timeout: SETTINGS.rpcTimeoutMs,
      }),
    }),
  };
}
export function constructorData(maximum, evmVersion = artifact.evmVersion) {
  if (!COMPILATION.acceptedDeploymentEvmVersions.includes(evmVersion))
    throw new Error("Unsupported EVM compilation target");
  if (!bytecodes.has(evmVersion)) {
    if (solc.version() !== artifact.compiler)
      throw new Error("Local compiler does not match the build artifact");
    // Preserve the source and other settings; reproduce only the supported EVM target declared by the manifest.
    const input = {
      ...artifact.input,
      settings: { ...artifact.input.settings, evmVersion },
    };
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    for (const error of output.errors ?? [])
      if (error.severity === "error") throw new Error(error.formattedMessage);
    const built =
      output.contracts["ArcRewardDistributor.sol"].ArcRewardDistributor;
    bytecodes.set(evmVersion, `0x${built.evm.bytecode.object}`);
  }
  return encodeDeployData({
    abi: artifact.abi,
    bytecode: bytecodes.get(evmVersion),
    args: [BigInt(maximum)],
  });
}
export async function verifyManifest(manifest, client) {
  if ((await client.getChainId()) !== manifest.chainId)
    throw new Error("RPC chainId mismatch");
  const [tx, receipt, code, version, maximum] = await Promise.all([
    client.getTransaction({ hash: manifest.transactionHash }),
    client.getTransactionReceipt({ hash: manifest.transactionHash }),
    client.getCode({ address: manifest.contractAddress }),
    client.readContract({
      address: manifest.contractAddress,
      abi: artifact.abi,
      functionName: "version",
    }),
    client.readContract({
      address: manifest.contractAddress,
      abi: artifact.abi,
      functionName: "maxRecipients",
    }),
  ]);
  if (
    receipt.status !== "success" ||
    receipt.contractAddress?.toLowerCase() !==
      manifest.contractAddress.toLowerCase() ||
    receipt.blockNumber !== BigInt(manifest.deploymentBlock) ||
    tx.to !== null ||
    tx.input !== constructorData(manifest.maxRecipients, manifest.evmVersion)
  )
    throw new Error(
      "Deployment transaction or constructor arguments failed verification",
    );
  if (
    !code ||
    keccak256(code) !== manifest.runtimeCodeHash ||
    version !== PROTOCOL.version ||
    version !== manifest.version ||
    maximum !== BigInt(manifest.maxRecipients) ||
    manifest.sourceHash !== artifact.sourceHash ||
    manifest.compiler !== artifact.compiler ||
    !COMPILATION.acceptedDeploymentEvmVersions.includes(manifest.evmVersion)
  )
    throw new Error("Deployment code, version, or build artifact mismatch");
  return true;
}
