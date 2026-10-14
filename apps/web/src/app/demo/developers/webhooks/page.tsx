import type { Metadata } from "next";

import { WebhooksView } from "@/components/dashboard/developer-views";

export const metadata: Metadata = { title: "Webhooks" };
export default function Page() {
  return <WebhooksView />;
}
