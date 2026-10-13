# Deployment and hosting

ArcBatch includes public manifests for Arc Mainnet, the current Arc Testnet deployment, and a legacy testnet deployment. Each deployment is identified by chain ID and contract address. The frontend enables payment only after its configured deployment passes live RPC checks.

## Versioned deployments

These records describe deployment verification performed on October 12–13, 2026. They are not an independent audit or a claim that explorer source verification has completed.

| Network             | Chain ID | Contract                                     | Limit | EVM target | Manifest                                                             |
| ------------------- | -------- | -------------------------------------------- | ----- | ---------- | -------------------------------------------------------------------- |
| Arc Mainnet         | 5042     | `0x083a96f75d6de7e97bd421820c98c25b07b79964` | 100   | Paris      | [mainnet.json](../public/deployments/mainnet.json)                   |
| Arc Testnet         | 5042002  | `0x6f184941553b2cb886fcc5dd77a2eb3fb979d89a` | 100   | Prague     | [testnet.json](../public/deployments/testnet.json)                   |
| Arc Testnet, legacy | 5042002  | `0x083a96f75d6de7e97bd421820c98c25b07b79964` | 2     | Prague     | [testnet-legacy-2.json](../public/deployments/testnet-legacy-2.json) |

Each manifest contains the deployment transaction, block, compiler, version, constructor limit, source hash, and runtime code hash. Verification compares the full creation input and constructor arguments, receipt, deployed code, version, and limit. The verifier accepts only EVM targets configured in `src/config.ts` and recompiles the declared target; it does not discard metadata to force a match.

The current testnet contract also passed read-only simulations for 1, 50, and 100 EOA recipients. Those simulations are not payment receipts and do not bound gas use by arbitrary contract receivers. Local operational reports and payment backups are intentionally excluded from the public repository.

## Frontend configuration

Copy `.env.example` to `.env.local` and replace its placeholders. Set `VITE_DEPLOYMENT_FILES` to a comma-separated list of existing manifest filenames. The frontend loads all selected manifests, and both the frontend and AppKit use the first manifest's network at startup. The network selector uses the matching contract for each configured chain. Configure the current mainnet manifest first and the current testnet manifest second when both networks should be available with mainnet as the default.

The legacy single-file `VITE_DEPLOYMENT_FILE` variable remains supported when `VITE_DEPLOYMENT_FILES` is absent. A configured list must contain distinct filenames and at most one contract per supported network; do not combine current and legacy testnet manifests. A missing or invalid selected manifest fails the build instead of publishing an incomplete configuration.

`VITE_REOWN_PROJECT_ID` is a public Reown identifier. Leave it empty for the injected-wallet fallback, or configure a project and its allowed origins for AppKit and WalletConnect. These values are bundled into frontend code and must contain no signing secrets.

## Reproduce and verify a deployment

Use the Node version in `.nvmrc`, run `npm ci`, then `npm run abi`. This compiles production Solidity with the pinned compiler, synchronizes the pinned OpenZeppelin source, and writes complete Standard JSON compiler input and bytecode into the ignored `artifacts/` directory.

```sh
npm run verify:deployment -- '<actual-manifest-path>'
export ARC_MEASURE_PAYER='<funded-public-payer-address>'
npm run measure -- '<actual-manifest-path>'
```

Verification and measurement are read-only. Measurement covers a small list, a midpoint, and the configured maximum. Fees and available block gas change over time; always simulate the actual list before paying.

Use the exact compiler input, compiler version, EVM target, optimizer settings, and constructor arguments when submitting source to an explorer. Report explorer verification only after the explorer confirms it.

## Create a new deployment

Existing contracts are immutable. A new deployment is a separate replay-protection domain; do not move an uncertain batch to another contract to bypass recovery.

Prepare a deployment with placeholders replaced by your own reviewed configuration:

```sh
export ARC_NETWORK='<mainnet-or-testnet>'
export ARC_MAX_RECIPIENTS='<positive-integer-confirmed-by-gas-measurement>'
export ARC_KEYSTORE_ACCOUNT='<encrypted-keystore-account-name>'
npm run deploy
```

The script queries chain and fee data and writes a local plan under `deployments/`. Review the chain, compiler, constructor, source hash, estimated gas, and required balance before broadcasting:

```sh
npm run deploy -- --broadcast
```

Signing uses an encrypted local keystore and an interactive password. No signing key belongs in an environment file, command argument, CI secret, or frontend hosting configuration. A verified public manifest is written only after a successful receipt and full deployment verification. After communication errors, inspect chain state before retrying.

## Hosting

Use the Vite preset, `npm ci`, `npm run build`, and output directory `dist`. The repository includes `vercel.json`. Select a Node.js 22 runtime compatible with `.nvmrc` and configure the two public frontend variables in Vercel before building. Rebuild after changing them and allow the resulting origin in Reown.

`.vercelignore` controls CLI uploads; `.gitignore` controls Git commits. Both exclude local environment files, wallet credentials, generated artifacts, operational evidence, and private notes. Public deployment manifests are included in Git so a clean checkout can build.

After linking the project, run `vercel deploy --dry --format=json` to inspect the actual CLI upload list before deployment. Its directory traversal does not append a slash when checking ignore rules, so directory allowlist entries deliberately omit trailing slashes.

Vercel automatically promotes a new project's first deployment to Production, including when the CLI requests Preview. Treat the initial deployment as a production release and configure the public variables for Production before publishing. Once Production is initialized, use `vercel deploy` for previews and `vercel deploy --prod` for production releases. See [Vercel's first-deployment behavior](https://vercel.com/blog/default-production-domain).

The build disables automatic copying of the entire `public/` directory. Its plugin validates and publishes only the explicitly selected manifests and logo. It excludes source maps and allows only the deployment-list setting, its legacy single-file fallback, and the public Reown Project ID as application `VITE_` variables. Vercel's automatic `VITE_VERCEL_*` metadata is accepted but not exposed to application code; other unexpected `VITE_*` variables stop the build.

Publishing this repository does not create a hosted website. Add the actual application URL to the repository's About section once its deployment has been checked.

## Compatibility references

Consult Arc's [network configuration](https://docs.arc.io/arc/references/connect-to-arc), [native stablecoin model](https://docs.arc.io/arc/concepts/stablecoin-native-model), and [EVM differences](https://docs.arc.io/arc/references/evm-differences) when changing chain support. The application uses 18-decimal native USDC accounting and limits reward input to six decimal places. It does not call the ERC-20 transfer or approval interface.

Standard tests use the local EVM. Optional Arc-specific tests and their limitations are described in [testing](testing.md).
