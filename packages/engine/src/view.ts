import { eq, inArray, schema, type Executor } from "@plinth/db";
import { formatUsdc, type TokenSymbol } from "@plinth/shared";
import { getAddress } from "viem";
import type { Engine } from "./context";

type Intent = typeof schema.paymentIntents.$inferSelect;
type Addr = typeof schema.invoiceAddresses.$inferSelect;

const money = (v: bigint) => ({ decimal: formatUsdc(v), units: v.toString() });

export interface IntentView {
  id: string;
  object: "payment_intent";
  livemode: boolean;
  kind: string;
  status: string;
  amount: string;
  amount_units: string;
  amount_received: string;
  amount_received_units: string;
  amount_pending: string;
  amount_pending_units: string;
  amount_settled: string;
  amount_settled_units: string;
  /** Platform fee taken from the settled funds, and what the merchant received after it. */
  fee_amount: string;
  fee_amount_units: string;
  net_amount: string;
  net_amount_units: string;
  amount_refunded: string;
  excess_amount: string;
  /** The token the payment is denominated and paid in (USDC or EURC). */
  currency: string;
  order_reference: string | null;
  description: string | null;
  customer_email: string | null;
  metadata: Record<string, string>;
  checkout_methods: string[];
  checkout_url: string;
  success_url: string | null;
  expires_at: string;
  created_at: string;
  paid_at: string | null;
  settled_at: string | null;
  networks: {
    network: string;
    chain_id: number;
    name: string;
    environment: string;
    /** Address of the payment token on this network (named usdc_address for existing clients; it is the payment token, whatever it is). */
    usdc_address: string;
    token: { symbol: string; address: string; decimals: number };
    deposit_address: string | null;
    deposit_address_explorer_url: string | null;
    wallet_checkout_supported: boolean;
    explorer_url: string;
    native_currency: { symbol: string; decimals: number };
    /** Public RPC endpoints a wallet may use to add this chain (never private provider URLs). */
    public_rpc_urls: string[];
    finality_confirmations: number;
  }[];
}

export function intentView(e: Engine, i: Intent, addrs: Addr[]): IntentView {
  const nets = i.allowedNetworks.flatMap((id) => {
    const c = e.chains.get(id);
    const tok = c?.tokens.get(i.currency as TokenSymbol);
    if (!c || !tok) return [];
    const a = addrs.find((x) => x.networkId === id);
    return [
      {
        network: id,
        chain_id: c.network.chainId,
        name: c.network.name,
        environment: c.network.environment,
        usdc_address: tok.config.address,
        token: { symbol: tok.symbol, address: tok.config.address, decimals: tok.config.decimals },
        deposit_address: a ? getAddress(a.address) : null,
        deposit_address_explorer_url: a ? `${c.network.explorerUrl}/address/${getAddress(a.address)}` : null,
        explorer_url: c.network.explorerUrl,
        native_currency: c.network.nativeCurrency,
        public_rpc_urls: c.network.rpcUrls,
        finality_confirmations: c.network.finality.confirmations,
        wallet_checkout_supported:
          i.checkoutMethods.includes("WALLET") && tok.config.authorization.receiveWithAuthorization && tok.config.authorization.verified,
      },
    ];
  });
  return {
    id: i.id,
    object: "payment_intent",
    livemode: i.environment === "live",
    kind: i.kind,
    status: i.status,
    amount: money(i.amount).decimal,
    amount_units: i.amount.toString(),
    amount_received: money(i.amountFinal).decimal,
    amount_received_units: i.amountFinal.toString(),
    amount_pending: money(i.amountPending).decimal,
    amount_pending_units: i.amountPending.toString(),
    amount_settled: money(i.amountSettled).decimal,
    amount_settled_units: i.amountSettled.toString(),
    fee_amount: money(i.feeAmount).decimal,
    fee_amount_units: i.feeAmount.toString(),
    net_amount: money(i.netAmount).decimal,
    net_amount_units: i.netAmount.toString(),
    amount_refunded: money(i.amountRefunded).decimal,
    excess_amount: money(i.excessAmount).decimal,
    currency: i.currency,
    order_reference: i.orderReference,
    description: i.description,
    customer_email: i.customerEmail,
    metadata: i.metadata,
    checkout_methods: i.checkoutMethods,
    checkout_url: `${e.cfg.publicWebUrl.replace(/\/$/, "")}/pay/${i.id}`,
    success_url: i.successUrl,
    expires_at: i.expiresAt.toISOString(),
    created_at: i.createdAt.toISOString(),
    paid_at: i.paidAt?.toISOString() ?? null,
    settled_at: i.settledAt?.toISOString() ?? null,
    networks: nets,
  };
}

export async function loadIntentView(e: Engine, tx: Executor, id: string): Promise<IntentView | null> {
  const [i] = await tx.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, id));
  if (!i) return null;
  const addrs = await tx.select().from(schema.invoiceAddresses).where(eq(schema.invoiceAddresses.paymentIntentId, id));
  return intentView(e, i, addrs);
}

export async function loadIntentViews(e: Engine, tx: Executor, intents: Intent[]): Promise<IntentView[]> {
  if (intents.length === 0) return [];
  const addrs = await tx
    .select()
    .from(schema.invoiceAddresses)
    .where(inArray(schema.invoiceAddresses.paymentIntentId, intents.map((i) => i.id)));
  return intents.map((i) => intentView(e, i, addrs.filter((a) => a.paymentIntentId === i.id)));
}
