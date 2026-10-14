import type { Metadata } from "next";

import { WebhookLogsView } from "@/components/dashboard/developer-views";

export const metadata: Metadata = { title: "Webhook logs" };
export default function Page() {
  return <WebhookLogsView />;
}
