# Contract review

This document summarizes a local self-review performed on October 13, 2026. It is not an independent security audit. The review found no blocking defect within the inspected scope; that does not establish that the project is free of vulnerabilities.

## Reviewed source

The review is bound to source bytes, because it preceded the first repository commit.

| File                                     | SHA-256                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `contracts/src/ArcRewardDistributor.sol` | `146f910beedc5d3bde5ddf8a7eabdae2fb6882acdeabf53215cf189706641ae7` |
| `contracts/src/Protocol.sol`             | `68813b3ddb00ed2967f940e86f10f37828723d26cf0fe36ba218a9141273d572` |

The reviewed mainnet build uses Solidity 0.8.30, Paris, optimizer 200 runs, version 1.0.0, and a 100-recipient constructor maximum. [mainnet.json](../public/deployments/mainnet.json) records the creation transaction, source hash, and runtime code hash. Changes to these source files or build settings require a new assessment.

## Scope

- Positive whole reward units, checked sums, and exact `msg.value` accounting.
- No use of a pre-existing contract balance as the distribution pool.
- Replay protection keyed by payer and batch ID.
- Complete list validation before external transfers, persistent reentrancy protection, and whole-batch rollback.
- Rejection of zero, payer, distributor, duplicate, and unsorted recipient addresses.
- Exact event counts, recipient indices, totals, and payload digests.
- No administrator, withdrawal, upgrade, arbitrary-call, or delegatecall entry point.
- Frontend verification of chain, target, payer, calldata, value, and full receipt events.

Local contract tests also cover gas-exhausting receivers, forced credits, cross-payer ID isolation, large return data, fuzz inputs, and invariants. See [testing](testing.md) for reproducible commands and coverage boundaries.

## Deployment verification

The mainnet receipt and full creation input were checked against the reviewed Paris build, including constructor arguments. Runtime code, contract version, and recipient limit also matched. Versioned deployment metadata is published under [public/deployments](../public/deployments).

This is RPC and bytecode verification. It does not establish explorer source-verification status or an independent security audit. Personal wallet balances, recipient lists, and local signing/debugging records are not part of this public review.

## Known boundaries

Any recipient can reject a transfer or consume gas, reverting the batch while still costing transaction fees. Simulation cannot guarantee future execution. Protocol-level restrictions may produce missing or delayed receipts; absence of a receipt is not proof that nothing was broadcast.

Unexpected native credits can bypass receive/fallback through protocol behavior. They cannot be swept by `distribute` and have no recovery path. The no-admin design deliberately provides no withdrawal mechanism.

Replay protection prevents re-execution of the same payer/batch ID on the same contract and chain. New IDs, other contracts, or other chains are separate payment contexts. The 100-recipient limit is not a fixed gas guarantee for arbitrary contract receivers.

Dependency advisories affect the frontend wallet integration separately from the compiled Solidity. Review current findings and supported upgrades before releases. Real-network rejection, blocklist, replacement, and cancellation exercises are not established by the standard local test suite.
