import type { Metadata } from "next";
import { Suspense } from "react";
import { NetworksView } from "@/components/dashboard/account-views";

export const metadata: Metadata = { title: "Networks & assets" };
export default function Page() {
  return <Suspense><NetworksView /></Suspense>;
}
