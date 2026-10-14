import type { Metadata } from "next";

import { WalletsView } from "@/components/dashboard/account-views";

export const metadata: Metadata = { title: "Wallets & payouts" };
export default function Page() {
  return <WalletsView />;
}
