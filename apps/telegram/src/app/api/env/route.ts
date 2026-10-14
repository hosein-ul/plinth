import { NextRequest, NextResponse } from "next/server";
import { ENV_COOKIE } from "@/lib/server-api";

/** Switch the dashboard between test (testnets) and live (mainnets) data. */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).host !== req.headers.get("host")) return NextResponse.json({ error: { code: "CSRF", message: "Cross-site request rejected" } }, { status: 403 });
  const { env } = (await req.json()) as { env?: string };
  const out = NextResponse.json({ env: env === "live" ? "live" : "test" });
  out.cookies.set(ENV_COOKIE, env === "live" ? "live" : "test", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return out;
}
