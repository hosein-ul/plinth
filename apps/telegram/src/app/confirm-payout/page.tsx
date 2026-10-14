import type { Metadata } from "next";
import { ConfirmLink } from "@/components/confirm-link";

export const metadata: Metadata = { title: "Confirm payout change", robots: { index: false } };
export default function Page() {
  return <ConfirmLink kind="payout" />;
}
