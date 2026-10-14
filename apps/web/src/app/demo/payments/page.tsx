import type { Metadata } from "next";

import { PaymentsView } from "@/components/dashboard/payments-view";

export const metadata: Metadata = { title: "Payments" };
export default function Page() {
  return <PaymentsView />;
}
