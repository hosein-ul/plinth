import type { Metadata } from "next";

import { InvoicesView } from "@/components/dashboard/links-invoices";

export const metadata: Metadata = { title: "Invoices" };
export default function Page() {
  return <InvoicesView />;
}
