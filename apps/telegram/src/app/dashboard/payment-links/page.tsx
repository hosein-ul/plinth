import type { Metadata } from "next";

import { PaymentLinksView } from "@/components/dashboard/links-invoices";

export const metadata: Metadata = { title: "Payment links" };
export default function Page() {
  return <PaymentLinksView />;
}
