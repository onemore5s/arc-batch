interface FeeSource {
  estimateFeesPerGas(): Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
  }>;
  getGasPrice(): Promise<bigint>;
}

// Payments and deployments share live RPC fee estimates instead of a hardcoded Arc fee floor.
export async function queryFees(client: FeeSource) {
  const [fees, suggested] = await Promise.all([
    client.estimateFeesPerGas(),
    client.getGasPrice(),
  ]);
  return {
    maxFeePerGas: fees.maxFeePerGas > suggested ? fees.maxFeePerGas : suggested,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
  };
}
