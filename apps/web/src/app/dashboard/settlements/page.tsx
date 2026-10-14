import type { Metadata } from "next";

import { SettlementsView } from "@/components/dashboard/ledger-views";

export const metadata: Metadata = { title: "Settlements" };
export default function Page() {
  return <SettlementsView />;
}
