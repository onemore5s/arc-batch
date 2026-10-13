# Contributing

Use the Node.js version in `.nvmrc`, install with `npm ci`, and follow the configuration steps in [README](README.md). `package-lock.json` pins dependencies, including the standard Foundry binaries.

## Development

Keep configuration in `src/config.ts`, environment variables, or existing shared tokens. Use placeholders in example configuration. Never commit wallet credentials, local payment exports, or recipient lists.

For behavioral changes, reproduce the issue with a failing test, implement the fix, and keep existing coverage thresholds. Preserve exact integer accounting, frozen payment snapshots, original-ID recovery, and full receipt verification. Include both English and Simplified Chinese for user-facing messages.

Run `npm run check`, `npm run contracts:coverage`, and `npm run e2e` before submitting a change. Browser tests require an available local Anvil port and use isolated test accounts. See [testing](docs/testing.md) for optional AppKit and Arc-specific checks.

If Solidity changes, regenerate `src/generated/abi.ts` with `npm run abi` and include its diff. Existing deployments are immutable: do not point their manifests at a different build or overwrite historical network identities.

## Pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) for commit messages. Describe the problem, resulting behavior, relevant validation, and any limitations. Include desktop and narrow-screen screenshots for visible changes, using synthetic test data.

Report security issues through the private route described in [SECURITY.md](SECURITY.md).
