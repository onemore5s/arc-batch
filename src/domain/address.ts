import { isAddress, getAddress, type Address } from "viem";
export function validAddress(value: string): boolean {
  const body = value.slice(2);
  return isAddress(value, {
    strict: !(body === body.toLowerCase() || body === body.toUpperCase()),
  });
}
export function normalizeAddress(value: string): Address {
  if (!validAddress(value)) throw new Error("钱包地址或校验和无效");
  return getAddress(value.toLowerCase());
}
