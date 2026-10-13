# Repository publication

## Source boundary

Keep the frontend, Solidity sources, contract tests, browser tests, build scripts, lockfile, public deployment manifests, documentation, and license together. `src/generated/abi.ts` is committed so source imports resolve immediately; `npm run abi` regenerates it and CI checks for drift.

Do not commit installed dependencies, `dist/`, `artifacts/`, caches, coverage, test results, `.env.local`, keystores, private keys, browser exports, or recipient lists. Root `/deployments/` contains local operational evidence and is ignored. `public/deployments/` contains public manifests and must remain included. `docs/private/` preserves unpublished notes locally and is ignored.

Only curated screenshots using local test accounts belong in `docs/images/`. Public addresses and transaction hashes in manifests are deployment metadata, not credentials.

## First publication

Run all documented checks from a fresh copy containing only files intended for Git. Configure the public testnet manifest explicitly; do not copy the developer's `.env.local`, installed dependencies, or generated build directories.

Before the first commit, inspect the staged file list and staged diff, including hidden files and documents. Search for credentials and private payment data. `.gitignore` does not remove files already tracked by Git; if a secret was published, rotate it and handle history cleanup separately.

Use the following repository description:

```text
Batch USDC payments on Arc.
```

Use the actual hosted application URL in GitHub's About section after verifying it. Keep contract links network-specific. Do not invent a deployment URL, source-verification badge, audit badge, or passing CI result.

After pushing, verify the real GitHub Actions run and enable private vulnerability reporting in the repository settings. The committed workflow runs checks only; it does not publish a website or broadcast transactions.

## Releases

Use Conventional Commits, review dependency advisories, and record which commit and manifests a release uses. Update deployment documentation when a new immutable contract is introduced. Preserve previous manifests required for historical payment verification.

A successful local build verifies the checked source on that local platform. Hosted CI results, explorer verification, and independent audits must be reported separately.
