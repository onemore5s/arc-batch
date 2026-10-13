# Security

ArcBatch has not received an independent security audit. Test coverage, local EVM tests, deployment bytecode checks, and the project's own [contract review](docs/mainnet-review.md) are separate forms of evidence and do not replace an audit.

## Reporting a vulnerability

Use **Security → Report a vulnerability** on the GitHub repository when private vulnerability reporting is available. If it is unavailable, ask the maintainer through their public GitHub profile for a private reporting channel before sharing exploit details. Do not include private keys, seed phrases, real recipient lists, or wallet backups in issues or pull requests.

Provide the affected revision, network and contract if applicable, a minimal reproduction with local test accounts, and expected versus actual behavior. Avoid testing against other people's funds or deployed contracts without authorization.

## Boundaries

- One failed transfer reverts the entire batch, but a failed transaction can still cost gas.
- Replay protection is scoped to payer, batch ID, contract, and network. Deliberately creating a new batch ID permits another payment.
- The contract has no administrator, upgrade path, withdrawal method, or recovery mechanism for unexpected balances.
- Simulation and local records are not proof of onchain execution; the UI verifies transaction input and complete receipt events.
- Frontend configuration, contract addresses, the ABI, and the Reown Project ID are public. Signing credentials must remain in the user's wallet or encrypted local keystore.

Dependency findings and supported validation commands are documented in [testing](docs/testing.md). No response-time or support-period guarantee is currently offered.
