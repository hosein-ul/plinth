import { redirect } from "next/navigation";
import { api, ApiError, currentEnv } from "@/lib/server-api";
import { Shell } from "@/components/shell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  let me;
  try {
    me = await api<{ merchant: { name: string }; user: { email: string; role: string } | null; role: string }>("/v1/me");
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) redirect("/login");
    throw e;
  }
  return <Shell me={me} env={await currentEnv()}>{children}</Shell>;
}
