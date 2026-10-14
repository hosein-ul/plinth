import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { api, ApiError } from "@/lib/server-api";
import { CheckoutView } from "@/components/checkout/checkout-view";

export const metadata: Metadata = { title: "Pay", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const initial = await api(`/public/checkout/${encodeURIComponent(id)}`, { auth: false });
    return <CheckoutView id={id} initial={initial} />;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
