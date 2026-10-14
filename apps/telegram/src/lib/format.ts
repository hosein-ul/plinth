/** Display helpers. Money arrives from the API as exact decimal strings; never parse it as a float. */

export function splitAmount(decimal: string): { whole: string; fraction: string } {
  const [w = "0", f = "00"] = decimal.split(".");
  return { whole: w.replace(/\B(?=(\d{3})+(?!\d))/g, ","), fraction: `.${f.padEnd(2, "0")}` };
}

export function shortHash(h: string, lead = 6, tail = 4): string {
  return h.length <= lead + tail + 1 ? h : `${h.slice(0, lead)}…${h.slice(-tail)}`;
}

const rtf = typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (!rtf) return iso;
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "info" | "bad" | "neutral"; hint: string }> = {
  CREATED: { label: "Created", tone: "neutral", hint: "Created, not yet open for payment." },
  AWAITING_PAYMENT: { label: "Awaiting payment", tone: "neutral", hint: "Waiting for funds." },
  DETECTED: { label: "Detected", tone: "info", hint: "A transfer was seen on-chain. Not final yet." },
  CONFIRMING: { label: "Confirming", tone: "info", hint: "Funds seen; waiting for network finality or the remaining amount." },
  PAID: { label: "Paid", tone: "ok", hint: "Final funds cover the amount. Settlement is about to start." },
  OVERPAID: { label: "Overpaid", tone: "warn", hint: "More than the requested amount was received." },
  SETTLEMENT_PENDING: { label: "Settling", tone: "info", hint: "Paid in full. Moving funds into the merchant vault." },
  SETTLED: { label: "Settled", tone: "ok", hint: "Funds are confirmed inside the merchant vault." },
  EXPIRED: { label: "Expired", tone: "neutral", hint: "Expired without payment." },
  UNDERPAID: { label: "Underpaid", tone: "warn", hint: "Expired with only part of the amount received." },
  LATE_PAYMENT: { label: "Late payment", tone: "warn", hint: "Funds arrived after expiry." },
  INVALID_ASSET: { label: "Wrong token", tone: "bad", hint: "A token other than the official payment token was sent." },
  SETTLEMENT_FAILED: { label: "Settlement failed", tone: "bad", hint: "Funds are final but the sweep failed. Retrying." },
  REFUND_REQUESTED: { label: "Refund requested", tone: "warn", hint: "A refund is waiting for the merchant to send it." },
  PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "neutral", hint: "Part of the payment was returned." },
  REFUNDED: { label: "Refunded", tone: "neutral", hint: "Returned to the customer." },
};

export const TX_STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "info" | "bad" | "neutral" }> = {
  DETECTED: { label: "Detected", tone: "info" },
  CONFIRMING: { label: "Confirming", tone: "info" },
  FINAL: { label: "Final", tone: "ok" },
  REORGED: { label: "Reorged", tone: "bad" },
};
