import { z } from "zod";

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/, "Invalid EVM address");
export const txHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "Invalid transaction hash");
/** Validated against the runtime network list by the API (built-ins plus optional local-dev). */
export const networkIdSchema = z.string().regex(/^[a-z0-9-]{2,40}$/);

/** Money crosses the API as a decimal string in USDC units ("12.50"); storage is integer base units. */
export const usdcAmountSchema = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, "Amount must be a decimal string with up to 6 decimals")
  .refine((s) => Number(s) > 0, "Amount must be greater than zero");

export const checkoutMethodSchema = z.enum(["WALLET", "ADDRESS"]);
export type CheckoutMethod = z.infer<typeof checkoutMethodSchema>;

/** Platform default for how long a payment intent stays payable: 20 minutes. */
export const DEFAULT_EXPIRY_SECONDS = 20 * 60;

export const createPaymentIntentSchema = z.object({
  amount: usdcAmountSchema,
  currency: z.literal("USDC").default("USDC"),
  order_reference: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
  networks: z.array(networkIdSchema).min(1).max(8).optional(),
  checkout_methods: z.array(checkoutMethodSchema).min(1).default(["WALLET", "ADDRESS"]),
  // No schema default on purpose: when omitted, the engine uses the merchant's default expiry setting
  // (which starts at DEFAULT_EXPIRY_SECONDS), so the per-merchant override actually applies.
  expires_in_seconds: z.number().int().min(300).max(60 * 60 * 24 * 30).optional().describe("Seconds the payment stays payable (300 to 2592000). Omit to use the merchant's default expiry, which is 1200 (20 minutes) unless changed in settings."),
  customer_email: z.string().email().max(320).optional(),
  success_url: z.string().url().max(2000).optional(),
  cancel_url: z.string().url().max(2000).optional(),
  metadata: z.record(z.string().max(40), z.string().max(500)).refine((m) => Object.keys(m).length <= 20).optional(),
});
export type CreatePaymentIntentInput = z.infer<typeof createPaymentIntentSchema>;

export const createPaymentLinkSchema = z.object({
  name: z.string().min(1).max(120),
  amount: usdcAmountSchema,
  description: z.string().max(500).optional(),
  networks: z.array(networkIdSchema).min(1).optional(),
  checkout_methods: z.array(checkoutMethodSchema).min(1).default(["WALLET", "ADDRESS"]),
  success_url: z.string().url().optional(),
  intent_expires_in_seconds: z.number().int().min(300).max(60 * 60 * 24 * 7).default(DEFAULT_EXPIRY_SECONDS),
});

export const createInvoiceSchema = z.object({
  customer_name: z.string().min(1).max(200),
  customer_email: z.string().email().max(320),
  memo: z.string().max(1000).optional(),
  due_in_days: z.number().int().min(1).max(90).default(14),
  line_items: z
    .array(
      z.object({
        description: z.string().min(1).max(300),
        quantity: z.number().int().min(1).max(100000).default(1),
        unit_amount: usdcAmountSchema,
      }),
    )
    .min(1)
    .max(100),
  networks: z.array(networkIdSchema).min(1).optional(),
  checkout_methods: z.array(checkoutMethodSchema).min(1).default(["WALLET", "ADDRESS"]),
});

export const settlementPolicySchema = z.object({
  /** Mirrors the on-chain mode. The authoritative value is the vault; this is the cached view. */
  underpayment_tolerance_bps: z.number().int().min(0).max(1000).default(0),
});

export const createWebhookEndpointSchema = z.object({
  url: z.string().url().max(2000),
  description: z.string().max(200).optional(),
  events: z.array(z.string()).min(1).default(["*"]),
});

export const createRefundRequestSchema = z.object({
  payment_intent_id: z.string().min(1),
  amount: usdcAmountSchema,
  recipient: addressSchema,
  reason: z.string().max(500).optional(),
});

export const submitRefundProofSchema = z.object({ tx_hash: txHashSchema });

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(80),
  environment: z.enum(["test", "live"]),
});

export const enableNetworkSchema = z.object({
  network: networkIdSchema,
  /** The merchant's own address that will own the vault (use a multisig in production). */
  owner_address: addressSchema,
});

export const signupSchema = z.object({
  business_name: z.string().min(2).max(120),
  email: z.string().email().max(320),
  password: z.string().min(12).max(200),
});
export const web3authSchema = z.object({ id_token: z.string().min(20).max(8000), business_name: z.string().trim().min(1).max(120).optional() });
/** Proof that the person at the keyboard owns the account right now: a password, or a fresh sign-in identity token. */
export const reauthSchema = z
  .object({ password: z.string().min(1).max(200).optional(), id_token: z.string().min(20).max(8000).optional() })
  .refine((r) => !!r.password || !!r.id_token, "Provide the password, or a fresh sign-in token");
export const emailChangeSchema = z.object({ email: z.string().trim().email().max(320), reauth: reauthSchema });
export const emailConfirmSchema = z.object({ token: z.string().min(20).max(200) });
export const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export const WEBHOOK_EVENT_TYPES = [
  "payment.detected",
  "payment.confirmed",
  "payment.completed",
  "payment.underpaid",
  "payment.overpaid",
  "payment.expired",
  "payment.late",
  "payment.invalid_asset",
  "settlement.submitted",
  "settlement.completed",
  "settlement.failed",
  "refund.requested",
  "refund.completed",
  "payout.requested",
  "payout.confirmed",
  "payout.switched_to_vault",
  "payout.cancelled",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export const walletPrepareSchema = z.object({ network: networkIdSchema, payer: addressSchema });
export const walletSubmitSchema = z.object({
  attempt_id: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/, "Expected a 65-byte hex signature"),
});
export const selectAddressNetworkSchema = z.object({ network: networkIdSchema });
