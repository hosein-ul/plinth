import type { Metadata } from "next";

import { SettingsView } from "@/components/dashboard/account-views";

export const metadata: Metadata = { title: "Settings" };
export default function Page() {
  return <SettingsView />;
}
