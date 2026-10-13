# Deployment manifests

This directory contains manifests backed by successful deployment receipts and RPC verification. `testnet.json` currently points to the 100-recipient contract deployed on October 12, 2026. Its receipt, constructor arguments, version, limit, full deployment input, and runtime code were verified. The actual target is Prague; the input was reproduced byte for byte using the pinned compiler and original source. `testnet-legacy-2.json` preserves the historical two-recipient deployment.

`mainnet.json` records the 100-recipient Arc mainnet contract verified on October 13, 2026 with the reviewed Paris build. Production builds publish only the selected manifest; this README and the unselected manifests are not copied to the website.

`npm run deploy -- --broadcast` writes a manifest only after successful verification. Set `VITE_DEPLOYMENT_FILE` to its filename. Each manifest requires `chainId`, `contractAddress`, `deploymentBlock`, `transactionHash`, `maxRecipients`, `version`, `compiler`, `evmVersion`, `sourceHash`, `runtimeCodeHash`, and `abiSource`. Never invent addresses or transaction hashes in examples. Do not put private metadata or credentials in a manifest; extra fields fail the production build.
