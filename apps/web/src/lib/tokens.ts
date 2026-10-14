/** Payment tokens as the dashboard sees them, read from the /v1/networks response. */
export type TokenSymbol = "USDC" | "EURC";

interface NetRow { id?: string; network?: string; name: string; vault?: { status: string } | null; tokens?: { symbol: string; vault?: { status: string } | null }[] }

/** A network's tokens; older responses carry only USDC, with the vault at the top level. */
function tokensOf(n: NetRow): { symbol: string; vault?: { status: string } | null }[] {
  return n.tokens ?? [{ symbol: "USDC", vault: n.vault }];
}

/** Tokens the merchant can take payments in right now: the ones with an ACTIVE vault on at least one network. USDC first. */
export function activeTokens(nets: NetRow[]): TokenSymbol[] {
  const have = new Set<string>();
  for (const n of nets) for (const t of tokensOf(n)) if (t.vault?.status === "ACTIVE") have.add(t.symbol);
  return (["USDC", "EURC"] as const).filter((s) => have.has(s));
}

/** Networks where the merchant has an ACTIVE vault for this token. */
export function netsForToken<T extends NetRow>(nets: T[], symbol: string): T[] {
  return nets.filter((n) => tokensOf(n).some((t) => t.symbol === symbol && t.vault?.status === "ACTIVE"));
}
