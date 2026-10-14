import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/** Public marketing routes only. The demo, dashboard, checkout and auth pages are intentionally absent. */
const ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/use-cases", priority: 0.8 },
  { path: "/networks", priority: 0.8 },
  { path: "/developers", priority: 0.8 },
  { path: "/integrations", priority: 0.7 },
  { path: "/security", priority: 0.8 },
  { path: "/pricing", priority: 0.7 },
  { path: "/compare", priority: 0.6 },
  { path: "/faq", priority: 0.6 },
  { path: "/status", priority: 0.5 },
  { path: "/contact", priority: 0.5 },
  { path: "/legal/terms", priority: 0.3 },
  { path: "/legal/privacy", priority: 0.3 },
  { path: "/legal/risk-disclosure", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((r) => ({ url: `${SITE_URL}${r.path === "/" ? "" : r.path}`, lastModified, priority: r.priority }));
}
