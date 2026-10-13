# Testing

## Reproduce the checks

Use `.nvmrc`, install with `npm ci`, and configure `.env.local` following [README](../README.md). A production build requires an existing deployment manifest; use the versioned testnet manifest for development and CI.

```sh
npm run check
npm run contracts:coverage
npx playwright install chromium
npm run e2e
```

If the development server is already using the default port, choose another available port:

```sh
ARC_E2E_PORT='<available-local-port>' npm run e2e
```

Anvil's local port must also be available. Initial Foundry compilation may download the pinned Solidity compiler. Test results, coverage, generated artifacts, and browser traces remain local ignored outputs.

## Continuous integration

[CI](../.github/workflows/ci.yml) runs on pushes, pull requests, and manual dispatches. It uses the pinned Node version, `npm ci`, the public testnet deployment manifest, and an empty Reown Project ID. It has read-only repository permissions, does not retain checkout credentials, and pins official actions to full commit hashes.

The workflow runs source checks, frontend coverage, deployment-verification script tests, contract tests, the production build, contract coverage, and desktop/mobile browser tests. It also checks that regenerating the ABI leaves `src/generated/abi.ts` unchanged. Coverage and test evidence are retained as workflow artifacts for seven days.

CI uses local Anvil accounts; no payment, deployment, private key, or Reown account on a public network is required. An actual hosted Actions result exists only after this workflow runs in the published repository.

## Frontend and scripts

Vitest covers exact amounts, address validation, CSV/paste parsing, frozen snapshots, backups, persistence, wallet state, simulation, receipt verification, transaction recovery, and UI behavior. V8 coverage thresholds remain 97% for statements, branches, functions, and lines. Generated ABI files and `src/main.tsx` are excluded; browser tests exercise the entry point.

Tests exercise independent IndexedDB claims, delayed preflights, changed wallets, missing receipts, same-ID retries, replacement transactions, and imported records that must be reverified. Deployment script tests cover compiler and bytecode verification separately from the frontend coverage denominator.

Inspect generated reports in `coverage/`. Test counts and percentages belong to the run that produced them; do not copy stale figures into release claims.

## Contracts

Standard Foundry tests cover input restrictions, exact balances, payer-scoped replay protection, event digests, contract recipients, reentrancy, overflow, forced credits, and atomic rollback. Adversarial receivers exercise gas exhaustion and large return data. Fuzz and invariant settings are centralized in `contracts/foundry.toml`.

`npm run contracts:coverage` writes `contracts/lcov.info` for production contract code. It excludes test contracts and third-party libraries. Coverage measures exercised code and is not a security audit.

## Browser tests

Playwright compiles and deploys production bytecode to local Anvil, then connects isolated test accounts through an injected provider. Desktop Chromium and Pixel 7 emulation cover imports, corrections, review, actual local balance changes, same-ID retries, refresh recovery, reports, backups, localization, copy controls, and narrow layouts.

A receiver can change behavior after a successful simulation. The browser suite verifies that the subsequent failed transaction rolls back all payments and that an explicit retry with the original ID pays only once. Mobile emulation is not a real phone-wallet test.

## Optional wallet and Arc checks

The separate AppKit suite uses the real SDK, wallet catalog, and WalletConnect relay with an isolated local payment provider. It requires a valid public Reown Project ID and network access:

```sh
npm run e2e:appkit
```

A QR URI or successful local payment does not demonstrate a real mobile-wallet session or a public-network payment.

To exercise Arc-specific Foundry behavior, install a verified [Arc Foundry release](https://docs.arc.io/arc/tutorials/install-arc-foundry) and configure its executable:

```sh
export ARC_FORGE='<absolute-path-to-verified-Arc-Foundry-forge>'
npm run contracts:arc
```

Standard CI does not claim Arc-specific protocol rejection, blocklist, or real-network replacement/cancellation coverage. Missing receipts remain unknown in the application.

## Dependency and release checks

Run `npm audit` before public releases and review affected paths alongside compatible upgrades. On October 13, 2026, a fresh install of the committed lockfile reported 21 moderate affected dependency entries and no high or critical entries. The underlying advisories affect `decode-uri-component` and `uuid` through wallet-SDK dependencies; propagated entries are not 21 distinct vulnerabilities. This is a dated result, not an audit-clean claim. The proposed automatic remediation includes a Wagmi major-version change; validate wallet compatibility separately instead of forcing unsupported versions to silence an advisory.

The production build currently reports a large EVM dependency chunk. It remains a performance consideration, not a failed compilation. Public-chain deployment manifests, local EVM tests, explorer verification, and an independent security audit are different evidence categories. See [contract review](mainnet-review.md) and [publication guidance](releasing.md).
