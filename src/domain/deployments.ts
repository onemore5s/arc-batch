import { NETWORKS } from "../config.ts";
import { deploymentSchema } from "./schema.ts";
import type { Deployment } from "./types.ts";

export function deploymentFiles(selection: unknown): string[] {
  if (typeof selection !== "string" || !selection.trim())
    throw new Error(
      "Set VITE_DEPLOYMENT_FILES to verified manifest filenames before building",
    );
  const files = selection.split(",").map((file) => file.trim());
  if (
    files.some(
      (file) => !/^[\w.-]+\.json$/.test(file) || file.includes(".."),
    ) ||
    new Set(files).size !== files.length
  )
    throw new Error("Invalid or duplicate deployment manifest filename");
  return files;
}

export function parseDeployments(values: unknown[]): Deployment[] {
  const deployments = values.map((value) => deploymentSchema.parse(value));
  if (
    deployments.some(
      (deployment) =>
        !Object.values(NETWORKS).some(
          (network) => network.id === deployment.chainId,
        ),
    ) ||
    new Set(deployments.map((deployment) => deployment.chainId)).size !==
      deployments.length
  )
    throw new Error(
      "Deployment manifests must select one contract per supported network",
    );
  return deployments as Deployment[];
}
