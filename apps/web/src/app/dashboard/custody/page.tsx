import type { Metadata } from "next";
import { Suspense } from "react";
import { CustodyView } from "@/components/dashboard/custody-view";

export const metadata: Metadata = { title: "Custody" };
export default function Page() {
  return <Suspense><CustodyView /></Suspense>;
}
