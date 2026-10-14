/** Every supported payment token (USDC, EURC) has 6 decimals. All amounts are bigint base units. */
export const USDC_DECIMALS = 6;
export const TOKEN_DECIMALS = 6;

/** "12.5" -> 12_500_000n for a token with `decimals` places. Rejects exponents, negatives and extra places. */
export function parseAmount(input: string, decimals: number = TOKEN_DECIMALS, label = "token"): bigint {
  const s = input.trim();
  if (!new RegExp(`^\\d+(\\.\\d{1,${decimals}})?$`).test(s)) throw new Error(`Invalid ${label} amount: "${input}"`);
  const [whole = "0", frac = ""] = s.split(".");
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0");
}

/** 12_500_000n -> "12.50" (minimum 2 decimals, trailing zeros trimmed down to that minimum). */
export function formatAmount(units: bigint, decimals: number = TOKEN_DECIMALS, opts: { minDecimals?: number } = {}): string {
  const min = opts.minDecimals ?? 2;
  const unit = 10n ** BigInt(decimals);
  const neg = units < 0n;
  const abs = neg ? -units : units;
  const whole = abs / unit;
  let frac = (abs % unit).toString().padStart(decimals, "0");
  while (frac.length > min && frac.endsWith("0")) frac = frac.slice(0, -1);
  return `${neg ? "-" : ""}${whole.toString()}.${frac}`;
}

/** USDC-named wrappers kept for existing callers: same thing at 6 decimals. */
export const parseUsdc = (input: string): bigint => parseAmount(input, USDC_DECIMALS, "USDC");
export const formatUsdc = (units: bigint, opts: { minDecimals?: number } = {}): string => formatAmount(units, USDC_DECIMALS, opts);

/** Split for UIs that dim the fractional part: "1,250" / ".50". */
export function splitUsdc(units: bigint): { whole: string; fraction: string } {
  const [w = "0", f = "00"] = formatAmount(units).split(".");
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
