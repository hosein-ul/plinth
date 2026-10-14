import { LLMS_TXT } from "@/lib/ai-kit";

export const dynamic = "force-static";
export function GET() {
  return new Response(LLMS_TXT, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
