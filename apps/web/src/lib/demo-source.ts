/**
 * Data source for /demo: answers the dashboard's API paths from static sample data.
 * It never touches the network. Imported only by app/demo/** (see scripts/check-demo-isolation.mjs).
 */
import type { DashboardDataSource } from "./data-source";
import { DEMO_HREF } from "./routes";
import { demoOverview, getDemoDataset } from "./demo-data";

class DemoNotFound extends Error {
  status = 404;
  constructor(path: string) {
    super(`"${path}" is not part of the demo.`);
  }
}

const list = (data: unknown[], extra: Record<string, unknown> = {}) => ({ object: "list", data, ...extra });

function resolve(path: string): unknown {
  const ds = getDemoDataset();
  const url = new URL(path, "http://demo.invalid");
  const q = url.searchParams;
  const limit = Math.max(1, Math.min(200, Number(q.get("limit") ?? 50)));
  const parts = url.pathname.split("/").filter(Boolean); // ["v1", "payments", ...]
  if (parts[0] !== "v1") throw new DemoNotFound(path);
  const [, res, a, b] = parts;

  switch (res) {
    case "me": return ds.me;
    case "overview": return demoOverview(ds, Math.max(1, Math.min(365, Number(q.get("days") ?? 30))));
    case "networks": return list(ds.networks);
    case "vaults": {
      const v = a ? ds.vaults[a] : undefined;
      if (!v) throw new DemoNotFound(path);
      return v;
    }
    case "payments": {
      if (a) {
        const p = ds.payments.find((x) => x.id === a);
        if (!p) throw new DemoNotFound(path);
        return p;
      }
      const statuses = q.get("status")?.split(",").filter(Boolean);
      const needle = q.get("q")?.toLowerCase();
      const cursor = q.get("cursor");
      let rows = ds.payments.filter((p) => (!statuses || statuses.includes(p.status)) && (!needle || `${p.id} ${p.order_reference ?? ""} ${p.description ?? ""} ${p.customer_email ?? ""}`.toLowerCase().includes(needle)));
      if (cursor) rows = rows.filter((p) => p.created_at < cursor);
      const page = rows.slice(0, limit);
      const more = rows.length > page.length;
      // List rows carry the summary only, like the real API.
      const slim = page.map(({ timeline: _t, transactions: _x, settlements: _s, attempts: _a, refunds: _r, invoice_addresses: _i, ...rest }) => rest);
      return list(slim, { has_more: more, next_cursor: more ? page[page.length - 1]!.created_at : null });
    }
    case "transactions": return list(ds.transactions.slice(0, limit));
    case "settlements": return list(ds.settlements.slice(0, limit));
    case "refund-requests": return list(ds.refundRequests);
    case "payment-links": return list(ds.paymentLinks);
    case "invoices": return list(ds.invoices);
    case "api-keys": return list(ds.apiKeys);
    case "webhook-endpoints": return list(ds.webhookEndpoints);
    case "webhook-deliveries": {
      if (a && b === "attempts") return list(ds.deliveryAttempts[a] ?? []);
      return list(ds.webhookDeliveries.slice(0, limit));
    }
    case "team": return list(ds.team);
    case "settlement-policy": return ds.policy;
    case "audit-events": return list(ds.audit.slice(0, limit));
    default: throw new DemoNotFound(path);
  }
}

/** A small delay keeps loading states honest without making the demo feel slow. */
const LATENCY_MS = 140;

export const demoSource: DashboardDataSource = {
  kind: "demo",
  basePath: DEMO_HREF,
  cacheScope: "demo",
  readOnly: true,
  get: (path) => new Promise((ok, fail) => setTimeout(() => { try { ok(resolve(path) as never); } catch (e) { fail(e); } }, LATENCY_MS)),
};
