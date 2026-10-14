import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/server-api";
import { LinkStart } from "./link-start";

export const metadata: Metadata = { title: "Pay", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const info = await api<{ name: string; description: string | null; amount: string; merchant_name: string }>(`/public/links/${encodeURIComponent(slug)}`, { auth: false });
    return <LinkStart slug={slug} info={info} />;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
