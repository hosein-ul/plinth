import type { Metadata } from "next";
import { ConfirmLink } from "@/components/confirm-link";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };
export default function Page() {
  return <ConfirmLink kind="email" />;
}
