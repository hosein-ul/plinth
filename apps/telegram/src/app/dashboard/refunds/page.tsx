import type { Metadata } from "next";

import { RefundsView } from "@/components/dashboard/ledger-views";

export const metadata: Metadata = { title: "Refund requests" };
export default function Page() {
  return <RefundsView />;
}
