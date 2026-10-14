"use client";
/**
 * The seam between the dashboard views and where their data comes from.
 *
 * - Without a provider the views talk to the real API through the same-origin BFF (unchanged behaviour).
 * - app/demo wraps the very same views in a provider whose source answers from static sample data and
 *   refuses every mutation with a polite notice.
 *
 * This file must never import demo data. The demo source is injected from app/demo only; see
 * scripts/check-demo-isolation.mjs, which fails the build if the real dashboard reaches for it.
 */
import * as React from "react";
import { toast } from "sonner";
import { apiFetch } from "./client-api";
import { DASHBOARD_HREF, SIGNUP_HREF } from "./routes";

export interface DashboardDataSource {
  kind: "live" | "demo";
  /** Prefix of the in-app routes: "/dashboard" or "/demo". */
  basePath: string;
  /** Namespaces the query cache so live and demo rows can never share an entry. */
  cacheScope: "api" | "demo";
  readOnly: boolean;
  get<T = any>(path: string): Promise<T>;
}

const liveSource: DashboardDataSource = { kind: "live", basePath: DASHBOARD_HREF, cacheScope: "api", readOnly: false, get: (path) => apiFetch(path) };

const Ctx = React.createContext<DashboardDataSource>(liveSource);

export function DashboardDataProvider({ source, children }: { source: DashboardDataSource; children: React.ReactNode }) {
  return <Ctx.Provider value={source}>{children}</Ctx.Provider>;
}

export function useDataSource(): DashboardDataSource {
  return React.useContext(Ctx);
}

/** Maps a "/dashboard/..." path onto the current tree ("/dashboard" or "/demo"). */
export function useHref(): (path: string) => string {
  const { basePath } = useDataSource();
  return React.useCallback((path: string) => (path === DASHBOARD_HREF || path.startsWith(`${DASHBOARD_HREF}/`) ? basePath + path.slice(DASHBOARD_HREF.length) : path), [basePath]);
}

/** Thrown in place of a mutation while browsing the demo. Never reaches the API. */
export class DemoReadOnlyError extends Error {
  constructor() {
    super("This is a demo with sample data.");
  }
}

/** The one polite notice shown for every action the demo refuses. */
export function notifyDemoReadOnly() {
  toast("This is a demo with sample data.", {
    id: "demo-read-only",
    description: "Create a free account to do this.",
    duration: 6000,
    action: { label: "Create a free account", onClick: () => window.location.assign(SIGNUP_HREF) },
  });
}
