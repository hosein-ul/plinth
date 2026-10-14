import type { Metadata } from "next";

/** Public origin used for canonical URLs, Open Graph and the sitemap. Set NEXT_PUBLIC_SITE_URL in production. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Date the draft legal pages were last edited. Update when their text changes. */
export const LEGAL_UPDATED = "2026-10-11";

/** Per-page metadata with an absolute canonical URL and matching Open Graph / Twitter fields. */
export function pageMeta(args: { title: string; description: string; path: string }): Metadata {
  const url = `${SITE_URL}${args.path}`;
  return {
    title: args.title,
    description: args.description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: "Plinth", title: `${args.title} · Plinth`, description: args.description },
    twitter: { card: "summary_large_image", title: `${args.title} · Plinth`, description: args.description },
  };
}
