import { createRoot } from "react-dom/client";
import { App, type Runtime } from "./App";
import { IndexedStore } from "./storage";
import {
  deploymentNetwork,
  discoverWallets,
  loadDeployment,
  RpcGateway,
} from "./chain/adapters";
import { configureWallets } from "./wallet-runtime";
import "./style.css";
async function start() {
  let deployments: Runtime["deployments"] = [],
    configurationError: string | undefined;
  try {
    deployments = await loadDeployment(import.meta.env.VITE_DEPLOYMENT_FILE);
  } catch (error) {
    configurationError = (error as Error).message;
  }
  const runtime: Runtime = {
    store: new IndexedStore(),
    deployments,
    configurationError,
    ...(await configureWallets({
      wallets: await discoverWallets(),
      projectId: import.meta.env.VITE_REOWN_PROJECT_ID,
      origin: window.location.origin,
      defaultNetwork: deploymentNetwork(deployments),
    })),
    gateway(chainId) {
      return new RpcGateway(
        chainId,
        runtime.deployments.find((d) => d.chainId === chainId),
      );
    },
  };
  createRoot(document.getElementById("root")!).render(
    <App runtime={runtime} />,
  );
}
void start();
