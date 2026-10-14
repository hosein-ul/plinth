import { audit, redact } from "./audit";
import type { Alert, AlertSink, Database, Logger } from "./alerts-deps";

/**
 * Operational alerts: structured log + audit trail + optional webhook (Slack/Discord-compatible JSON).
 * De-duplicated per key for `cooldownMs` so a stuck queue does not page every tick.
 */
export class DefaultAlertSink implements AlertSink {
  private last = new Map<string, number>();
  constructor(
    private readonly db: Database,
    private readonly log: Logger,
    private readonly webhookUrl?: string,
    private readonly cooldownMs = 60 * 60 * 1000,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async raise(alert: Alert): Promise<void> {
    const t = this.now().getTime();
    const prev = this.last.get(alert.key);
    if (prev !== undefined && t - prev < this.cooldownMs) return;
    this.last.set(alert.key, t);
    const detail = redact(alert.detail) as Record<string, unknown>;
    const fn = alert.severity === "info" ? this.log.info : alert.severity === "warning" ? this.log.warn : this.log.error;
    fn.call(this.log, `ALERT ${alert.title}`, { key: alert.key, ...detail });
    // Detached on purpose: callers may hold a DB transaction (single-connection PGlite would deadlock if we awaited).
    void (async () => {
      await audit(this.db as never, { actor: { type: "SYSTEM" }, action: `alert.${alert.severity}`, data: { key: alert.key, title: alert.title, ...detail } }).catch(() => undefined);
      if (this.webhookUrl) {
        await fetch(this.webhookUrl, {
          method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(5000),
          body: JSON.stringify({ text: `[${alert.severity.toUpperCase()}] ${alert.title}`, key: alert.key, detail }),
        }).catch(() => undefined);
      }
    })();
  }
}

export class MemoryAlertSink implements AlertSink {
  readonly alerts: Alert[] = [];
  async raise(alert: Alert) {
    this.alerts.push(alert);
  }
}
