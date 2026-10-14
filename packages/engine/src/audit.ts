import { newId } from "@plinth/shared";
import { auditEvents, type Executor } from "@plinth/db";

export type Actor = { type: "USER" | "API_KEY" | "SYSTEM" | "RELAYER"; id?: string; ip?: string };

const SENSITIVE = /(password|secret|signature|private|authorization|api[_-]?key|token|mnemonic|seed)/i;

/** Remove anything that looks like credential material before it can reach the audit log. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== "object") return typeof value === "bigint" ? value.toString() : value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1)]),
  );
}

export async function audit(
  tx: Executor,
  entry: { merchantId?: string | null; actor: Actor; action: string; targetType?: string; targetId?: string; data?: Record<string, unknown> },
): Promise<void> {
  await tx.insert(auditEvents).values({
    id: newId("aud"),
    merchantId: entry.merchantId ?? null,
    actorType: entry.actor.type,
    actorId: entry.actor.id ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    data: (redact(entry.data ?? {}) as Record<string, unknown>) ?? {},
    ip: entry.actor.ip ?? null,
  });
}
