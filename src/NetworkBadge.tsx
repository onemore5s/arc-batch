import type { Chain } from "viem";

export function NetworkBadge({
  chain,
}: {
  chain: Pick<Chain, "name" | "testnet">;
}) {
  return (
    <span
      className="network-badge"
      data-network={chain.testnet ? "testnet" : "mainnet"}
    >
      {chain.name}
    </span>
  );
}
