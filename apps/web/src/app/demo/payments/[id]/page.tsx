import type { Metadata } from "next";
import { PaymentDetail } from "@/components/dashboard/payment-detail";

export const metadata: Metadata = { title: "Payment" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaymentDetail id={id} />;
}
