import { API_URL } from "@/lib/server-api";

export interface LiveNetwork {
  id: string;
  name: string;
  chain_id: number;
  environment: "testnet" | "mainnet";
  operational: boolean;
  relayer: string;
  head_block: string | null;
  wallet_checkout: boolean;
  address_checkout: boolean;
}

/**
 * The networks the running API reports as open for payments, read server-side from its public status endpoint and cached for
 * 15 seconds. Returns null when the API cannot be reached, so a page never claims a network is live without a reading.
 */
export async function readLiveNetworks(): Promise<LiveNetwork[] | null> {
  try {
    const res = await fetch(`${API_URL}/public/status`, { next: { revalidate: 15 }, signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const j = (await res.json()) as { networks?: LiveNetwork[] };
    return Array.isArray(j.networks) ? j.networks : null;
  } catch {
    return null;
  }
}
