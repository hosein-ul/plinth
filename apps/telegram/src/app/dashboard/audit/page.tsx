import type { Metadata } from "next";

import { AuditView } from "@/components/dashboard/ledger-views";

export const metadata: Metadata = { title: "Audit log" };
export default function Page() {
  return <AuditView />;
}
