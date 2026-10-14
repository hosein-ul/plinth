/** USDC has 6 decimals on every supported network. All amounts are bigint base units. */
export const USDC_DECIMALS = 6;
const UNIT = 10n ** BigInt(USDC_DECIMALS);

/** "12.5" -> 12_500_000n. Rejects floats-with-exponent, negatives, and >6 decimal places. */
export function parseUsdc(input: string): bigint {
  const s = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(s)) throw new Error(`Invalid USDC amount: "${input}"`);
  const [whole = "0", frac = ""] = s.split(".");
  return BigInt(whole) * UNIT + BigInt(frac.padEnd(USDC_DECIMALS, "0") || "0");
}

/** 12_500_000n -> "12.50" (minimum 2 decimals, trailing zeros trimmed down to 2). */
export function formatUsdc(units: bigint, opts: { minDecimals?: number } = {}): string {
  const min = opts.minDecimals ?? 2;
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / UNIT;
  let frac = (abs % UNIT).toString().padStart(USDC_DECIMALS, "0");
  while (frac.length > min && frac.endsWith("0")) frac = frac.slice(0, -1);
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

/** Split for UIs that dim the fractional part: "1,250" / ".50". */
export function splitUsdc(units: bigint): { whole: string; fraction: string } {
  const [w = "0", f = "00"] = formatUsdc(units).split(".");
  return { whole: w.replace(/\B(?=(\d{3})+(?!\d))/g, ","), fraction: `.${f}` };
}

/**
 * Arc exposes USDC with 18 decimals as the NATIVE (gas) unit and with 6 decimals through the ERC-20
 * interface. They are the same balance. Convert only for gas-cost accounting.
 */
export function arcNativeToUsdcUnits(nativeWei: bigint): bigint {
  return nativeWei / 10n ** 12n;
}

export function mulBps(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) throw new Error("bps must be a non-negative integer");
  return (amount * BigInt(bps)) / 10_000n;
}
