# User guide

## Language

New visitors see English. Use **EN** or **Chinese** in the header to switch; either preference survives a reload when browser storage is available. The switch translates interface messages and report statuses, never wallet names, addresses, recipient labels, activity names, or payment data. Reown's own wallet menus currently use English.

## Prepare recipients

CSV requires `address` and `amount` columns, with optional `label`; column order can vary. BOM, CRLF, and quoted fields are supported. Replace example placeholders with your own authorized recipients and amounts.

Paste one address and amount per line, separated by spaces or tabs, or choose **Add recipient**. Invalid rows, duplicate addresses, forbidden recipients, mismatched columns, and unknown headers block payment rather than being silently discarded.

Amounts must be positive ordinary decimals with no more than six fractional digits. Scientific notation, thousands separators, signs, NaN, and Infinity are rejected. Recipients cannot be the zero address, the payer, or the distributor itself. Contract wallets are allowed if they accept the transfer.

## Connect a wallet

Choose **Connect wallet** to open Reown AppKit. Select an installed extension, search the wallet catalog, or use WalletConnect with your wallet's scanner. Mobile browsers can use wallet deep links. The selected wallet must support Arc and EVM transaction signing.

Connection grants account access; paying requires a separate transaction confirmation in your wallet. There is no ArcBatch account registration. Email, social login, buying, swapping, and AppKit's internal send flow are disabled.

Select your connected address to manage or disconnect the account. Disconnect before choosing another wallet. Reloading attempts to restore the session. Account, network, and connection changes invalidate the current payment preflight.

If QR connection is unavailable, use the injected browser-wallet fallback. Check the Reown project configuration and connectivity, or open the site inside a wallet browser.

## Review and pay

Connect your wallet, select the appropriate Arc network, and choose **Review payments**. The review retains original input order, row numbers, amounts, and labels, becomes read-only, and shows row statuses. Copy controls expose complete addresses. The execution snapshot is separately sorted by address without changing recipient/amount pairs.

Reward total, estimated fee, and conservative required balance are separate amounts. A balance equal to the rewards cannot pay for gas. The safety margin reserves enough balance; actual cost is `gasUsed × effectiveGasPrice` from the receipt.

Before the signature request, the batch ID, recipient snapshot, and payment context are persisted. After wallet confirmation, the transaction hash is saved and linked to the explorer. The batch cannot be resubmitted while pending. Any failed recipient reverts all rewards, though gas may still be charged.

## Uncertain results and retries

A wallet communication error, missing hash after refresh, or RPC timeout does not prove failure. Continue verification or recover from the actual transaction hash in **History**. Submitted batches keep their original chain and payer even if the wallet disconnects or changes networks.

An explicit retry keeps the original ID and snapshot, checks `executed`, and simulates again. It requires the original payer. Both attempts may cost gas, but only one can pay the batch. If `executed` is true but full evidence is missing, keep verifying; resubmission is blocked.

Only an explicit new batch generates a new ID. Matching historical recipient lists require review. An unresolved batch cannot be bypassed by automatically creating a new ID.

## Save records

CSV reports include the network, contract, payer, batch ID, digest, transaction hash, addresses, amounts, status, original row, and label. Only complete onchain verification permits a paid status. User-controlled text is protected against spreadsheet formula injection.

JSON backups preserve frozen snapshots and attempts. Imported success labels and receipt summaries are not trusted; restored records need onchain verification. Clearing browser storage removes local names and notes. Transaction hashes recover public chain data; local metadata requires a backup.

## Limits

Adjust lists that exceed the contract's per-batch limit; automatic splitting is not implemented. Always pay through `distribute`. There is no administrator withdrawal or recovery mechanism for accidental contract balances. The project has not received an independent security audit.
