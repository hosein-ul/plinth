/**
 * The one place the site's public URLs come from. There are NO fallbacks: a missing value fails the build (and the
 * dev server) instead of silently shipping a development default or a placeholder host. Set them in the host's environment
 * (Vercel project `plinth`) and, for local work, in `apps/web/.env.local`.
 *
 *   NEXT_PUBLIC_SITE_URL  where this site is served (canonical links, Open Graph, the checkout host shown on the page)
 *   NEXT_PUBLIC_API_URL   the public Plinth API (OpenAPI link, code samples)
 *   NEXT_PUBLIC_MCP_URL   the hosted MCP endpoint
 *
 * The server-only `API_URL` (what the BFF calls) is read in `server-api.ts` through the same `required` helper.
 */
export function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`${name} is not set. Set it in the environment of this deployment (see apps/web/src/lib/config.ts); there is deliberately no fallback.`);
  }
  return value.trim().replace(/\/$/, "");
}

// Next.js only inlines `process.env.NEXT_PUBLIC_*` when it is written out literally, so each one is spelled here.
export const SITE_URL = required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL);
export const PUBLIC_API_URL = required("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL);
export const MCP_URL = required("NEXT_PUBLIC_MCP_URL", process.env.NEXT_PUBLIC_MCP_URL);

/** The host customers see in their address bar at checkout: the host of this site. */
export const CHECKOUT_HOST = new URL(SITE_URL).host;
