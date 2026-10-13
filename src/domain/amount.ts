import { PROTOCOL, UINT256_MAX } from "../config";
const UNIT = 10n ** BigInt(PROTOCOL.nativeDecimals);
export function parseAmount(text: string): bigint {
  const value = text.trim();
  if (
    !new RegExp(`^\\d+(?:\\.\\d{1,${PROTOCOL.rewardDecimals}})?$`).test(value)
  )
    throw new Error("金额须为普通正十进制，最多 6 位小数");
  const [whole, fraction = ""] = value.split(".");
  const amount =
    BigInt(whole) * UNIT +
    BigInt(fraction.padEnd(PROTOCOL.nativeDecimals, "0"));
  if (amount <= 0n || amount > UINT256_MAX)
    throw new Error("金额须大于零且不超过 uint256");
  return amount;
}
export function formatNative(value: bigint): string {
  if (value < 0n) throw new Error("金额不能为负");
  const whole = value / UNIT,
    fraction = (value % UNIT)
      .toString()
      .padStart(PROTOCOL.nativeDecimals, "0")
      .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
export function sumAmounts(values: bigint[]): bigint {
  return values.reduce((total, value) => {
    if (value < 0n || total + value > UINT256_MAX)
      throw new Error("奖励总额超过 uint256");
    return total + value;
  }, 0n);
}
