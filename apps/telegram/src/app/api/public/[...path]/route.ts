import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "@/lib/server-api";

/** Unauthenticated gateway for hosted checkout, payment links and the status page only. */
async function handle(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = path.join("/");
  if (!/^(checkout|links|status)(\/|$)/.test(target)) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found" } }, { status: 404 });
  if (req.method !== "GET") {
    const origin = req.headers.get("origin");
    if (!origin || new URL(origin).host !== req.headers.get("host") || req.headers.get("x-plinth-csrf") !== "1") {
      return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request rejected" } }, { status: 403 });
    }
  }
  const res = await fetch(`${API_URL}/public/${target}${req.nextUrl.search}`, {
    method: req.method,
    headers: { "content-type": req.headers.get("content-type") ?? "application/json", "x-forwarded-for": req.headers.get("x-forwarded-for") ?? "" },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.text(),
    cache: "no-store",
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export { handle as GET, handle as POST };
