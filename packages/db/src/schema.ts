import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Money is ALWAYS integer base units (USDC = 6 decimals) in `bigint` columns. No floats anywhere.
 * `network_id` is the registry slug (e.g. "arc-testnet"); transfers are unique per (network, tx, log).
 */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const money = (name: string) => bigint(name, { mode: "bigint" });
const createdAt = () => ts("created_at").notNull().defaultNow();

export const merchants = pgTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED
  underpaymentToleranceBps: integer("underpayment_tolerance_bps").notNull().default(0),
  overpaymentPolicy: text("overpayment_policy").notNull().default("ACCEPT"), // ACCEPT | FLAG
  // 20 minutes; keep in sync with DEFAULT_EXPIRY_SECONDS in @plinth/shared. Existing rows keep their stored value.
  defaultExpirySeconds: integer("default_expiry_seconds").notNull().default(1200),
  /** Platform fee override in basis points for this merchant; null = the platform default. Always bounded by the on-chain cap. */
  feeBps: integer("fee_bps"),
  invoiceSeq: integer("invoice_seq").notNull().default(0),
  createdAt: createdAt(),
});

export const merchantUsers = pgTable(
  "merchant_users",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("OWNER"), // OWNER | ADMIN | DEVELOPER | VIEWER
    /** Set once the address was proven (emailed link) or vouched for by the identity provider. Null = unverified. */
    emailVerifiedAt: ts("email_verified_at"),
    createdAt: createdAt(),
    lastLoginAt: ts("last_login_at"),
  },
  (t) => [uniqueIndex("merchant_users_email_uq").on(sql`lower(${t.email})`), index("merchant_users_merchant_idx").on(t.merchantId)],
);

/** Single-use links sent by email: verify the current address, or add/replace it. Only the hash of the token is stored. */
export const emailVerifications = pgTable(
  "email_verifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => merchantUsers.id),
    email: text("email").notNull(),
    purpose: text("purpose").notNull(), // VERIFY (current address) | CHANGE (add or replace the address)
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("email_verifications_token_uq").on(t.tokenHash), index("email_verifications_user_idx").on(t.userId, t.createdAt)],
);

/** A sign-in identity from an external provider (e.g. Web3Auth), linked to one dashboard user. */
export const externalIdentities = pgTable(
  "external_identities",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => merchantUsers.id),
    provider: text("provider").notNull(), // "web3auth"
    subject: text("subject").notNull(), // stable id from the provider, e.g. "google:alice@example.com" or "wallet:0x..."
    email: text("email"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("external_identities_provider_subject_uq").on(t.provider, t.subject), index("external_identities_user_idx").on(t.userId)],
);

export const sessions = pgTable("sessions", {
  /** SHA-256 of the bearer token; the token itself is never stored. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => merchantUsers.id),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
});

export const networks = pgTable("networks", {
  id: text("id").primaryKey(),
  chainId: integer("chain_id").notNull(),
  name: text("name").notNull(),
  environment: text("environment").notNull(), // testnet | mainnet
  enabled: boolean("enabled").notNull().default(false),
  operational: boolean("operational").notNull().default(false),
  gateReasons: jsonb("gate_reasons").$type<string[]>().notNull().default([]),
  deployment: jsonb("deployment").$type<Record<string, unknown> | null>(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const assets = pgTable(
  "assets",
  {
    id: text("id").primaryKey(),
    networkId: text("network_id").notNull().references(() => networks.id),
    symbol: text("symbol").notNull(),
    address: text("address").notNull(),
    decimals: integer("decimals").notNull(),
    isOfficial: boolean("is_official").notNull().default(true),
    supportsReceiveAuthorization: boolean("supports_receive_authorization").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("assets_network_address_uq").on(t.networkId, t.address)],
);

export const merchantWallets = pgTable(
  "merchant_wallets",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    kind: text("kind").notNull(), // VAULT_OWNER | PAYOUT
    address: text("address").notNull(),
    label: text("label"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("merchant_wallets_uq").on(t.merchantId, t.networkId, t.kind, t.address)],
);

export const merchantVaults = pgTable(
  "merchant_vaults",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    ownerAddress: text("owner_address").notNull(),
    vaultAddress: text("vault_address").notNull(),
    status: text("status").notNull().default("PENDING"), // PENDING | DEPLOYING | ACTIVE | FAILED
    createRelayerOpId: text("create_relayer_op_id"),
    createTxHash: text("create_tx_hash"),
    configDelaySeconds: integer("config_delay_seconds").notNull(),
    // Cached read-model of on-chain state. The chain is authoritative.
    cachedMode: text("cached_mode"),
    cachedDestination: text("cached_destination"),
    cachedBalance: money("cached_balance"),
    cachedAt: ts("cached_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("merchant_vaults_merchant_network_uq").on(t.merchantId, t.networkId),
    uniqueIndex("merchant_vaults_address_uq").on(t.networkId, t.vaultAddress),
  ],
);

/**
 * How a merchant wants to be paid on a network. Every change is a new row; the newest CONFIRMED row whose
 * `active_from` has passed is the one used for NEW invoices. Existing invoice addresses keep the destination
 * they were issued with. No row means the default: pay into the merchant's vault.
 */
export const merchantPayoutConfigs = pgTable(
  "merchant_payout_configs",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    mode: text("mode").notNull(), // VAULT | DIRECT
    /** The registered payout wallet (DIRECT). Null for VAULT, which uses the merchant's vault. */
    address: text("address"),
    /** PENDING_CONFIRMATION | CONFIRMED | SUPERSEDED | DISABLED | EXPIRED */
    status: text("status").notNull().default("PENDING_CONFIRMATION"),
    /** Proof of control: the exact EIP-4361 message the wallet signed, and the signature. */
    proofMessage: text("proof_message"),
    proofSignature: text("proof_signature"),
    proofSignedAt: ts("proof_signed_at"),
    requestedByUserId: text("requested_by_user_id"),
    confirmationTokenHash: text("confirmation_token_hash"),
    confirmationExpiresAt: ts("confirmation_expires_at"),
    confirmedAt: ts("confirmed_at"),
    /** New invoices use this config only from this moment (confirmation time plus the cooldown). */
    activeFrom: ts("active_from"),
    createdAt: createdAt(),
  },
  (t) => [
    index("merchant_payout_configs_lookup_idx").on(t.merchantId, t.networkId, t.createdAt),
    uniqueIndex("merchant_payout_configs_token_uq").on(t.confirmationTokenHash).where(sql`${t.confirmationTokenHash} is not null`),
  ],
);

/** Single-use, short-lived challenge a wallet must sign to prove it controls a payout address. */
export const payoutChallenges = pgTable(
  "payout_challenges",
  {
    nonce: text("nonce").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    address: text("address").notNull(),
    purpose: text("purpose").notNull(), // PAYOUT_WALLET | VAULT_OWNER
    message: text("message").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: createdAt(),
  },
  (t) => [index("payout_challenges_merchant_idx").on(t.merchantId, t.createdAt)],
);

/** The route committed to a payment for each of its networks, whichever checkout method is used. */
export const paymentIntentRoutes = pgTable(
  "payment_intent_routes",
  {
    id: text("id").primaryKey(),
    paymentIntentId: text("payment_intent_id").notNull().references(() => paymentIntents.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    destinationKind: text("destination_kind").notNull(), // VAULT | DIRECT
    destinationAddress: text("destination_address").notNull(),
    feeBps: integer("fee_bps").notNull(),
    treasuryAddress: text("treasury_address").notNull(),
    payoutConfigId: text("payout_config_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_intent_routes_uq").on(t.paymentIntentId, t.networkId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    environment: text("environment").notNull(), // test | live
    name: text("name").notNull(),
    prefix: text("prefix").notNull(), // displayable, non-secret
    keyHash: text("key_hash").notNull(), // SHA-256(secret)
    lastUsedAt: ts("last_used_at"),
    revokedAt: ts("revoked_at"),
    rotatedFromId: text("rotated_from_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_keys_hash_uq").on(t.keyHash), index("api_keys_merchant_idx").on(t.merchantId)],
);

export const paymentLinks = pgTable(
  "payment_links",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    environment: text("environment").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    amount: money("amount").notNull(),
    allowedNetworks: text("allowed_networks").array().notNull(),
    checkoutMethods: text("checkout_methods").array().notNull(),
    successUrl: text("success_url"),
    intentExpirySeconds: integer("intent_expiry_seconds").notNull().default(1200),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("payment_links_slug_uq").on(t.slug), index("payment_links_merchant_idx").on(t.merchantId)],
);

export const paymentIntents = pgTable(
  "payment_intents",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    environment: text("environment").notNull(), // test | live
    kind: text("kind").notNull().default("PAYMENT_INTENT"), // PAYMENT_INTENT | INVOICE | PAYMENT_LINK
    /** keccak256(id): the bytes32 invoice identifier committed on-chain. */
    invoiceId32: text("invoice_id32").notNull(),
    paymentLinkId: text("payment_link_id").references(() => paymentLinks.id),
    orderReference: text("order_reference"),
    description: text("description"),
    amount: money("amount").notNull(),
    currency: text("currency").notNull().default("USDC"),
    allowedNetworks: text("allowed_networks").array().notNull(),
    checkoutMethods: text("checkout_methods").array().notNull(),
    status: text("status").notNull().default("CREATED"),
    expiresAt: ts("expires_at").notNull(),
    customerEmail: text("customer_email"),
    successUrl: text("success_url"),
    cancelUrl: text("cancel_url"),
    metadata: jsonb("metadata").$type<Record<string, string>>().notNull().default({}),
    // Derived accounting snapshot (recomputed from transfers/settlements on every change).
    amountPending: money("amount_pending").notNull().default(sql`0`),
    amountFinal: money("amount_final").notNull().default(sql`0`),
    amountEligible: money("amount_eligible").notNull().default(sql`0`),
    amountSettled: money("amount_settled").notNull().default(sql`0`),
    amountRefunded: money("amount_refunded").notNull().default(sql`0`),
    /** Platform fee actually taken on FINAL swept funds, and what the merchant received after it (settled - fee). */
    feeAmount: money("fee_amount").notNull().default(sql`0`),
    netAmount: money("net_amount").notNull().default(sql`0`),
    excessAmount: money("excess_amount").notNull().default(sql`0`),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    paidAt: ts("paid_at"),
    settledAt: ts("settled_at"),
  },
  (t) => [
    index("payment_intents_merchant_created_idx").on(t.merchantId, t.createdAt),
    index("payment_intents_status_idx").on(t.status, t.expiresAt),
    uniqueIndex("payment_intents_invoice_id32_uq").on(t.invoiceId32),
  ],
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    paymentIntentId: text("payment_intent_id").notNull().references(() => paymentIntents.id),
    number: text("number").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    memo: text("memo"),
    lineItems: jsonb("line_items").$type<{ description: string; quantity: number; unitAmount: string }[]>().notNull(),
    issuedAt: ts("issued_at").notNull().defaultNow(),
    dueAt: ts("due_at").notNull(),
  },
  (t) => [uniqueIndex("invoices_number_uq").on(t.merchantId, t.number), uniqueIndex("invoices_intent_uq").on(t.paymentIntentId)],
);

export const invoiceAddresses = pgTable(
  "invoice_addresses",
  {
    id: text("id").primaryKey(),
    paymentIntentId: text("payment_intent_id").notNull().references(() => paymentIntents.id),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    address: text("address").notNull(),
    /** Set for VAULT-kind addresses only (it equals destination_address there). Null for DIRECT. */
    vaultAddress: text("vault_address"),
    /** What the address commits to: where the net amount goes, which kind it is, and the fee. All immutable on-chain. */
    destinationKind: text("destination_kind").notNull().default("VAULT"), // VAULT | DIRECT
    destinationAddress: text("destination_address").notNull(),
    feeBps: integer("fee_bps").notNull().default(0),
    treasuryAddress: text("treasury_address"),
    merchantId32: text("merchant_id32").notNull(),
    invoiceId32: text("invoice_id32").notNull(),
    factoryAddress: text("factory_address").notNull(),
    implementationAddress: text("implementation_address").notNull(),
    contractVersion: integer("contract_version").notNull(),
    createdBlock: bigint("created_block", { mode: "bigint" }).notNull(),
    deployedAt: ts("deployed_at"),
    deployTxHash: text("deploy_tx_hash"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoice_addresses_net_addr_uq").on(t.networkId, t.address),
    uniqueIndex("invoice_addresses_intent_net_uq").on(t.paymentIntentId, t.networkId),
  ],
);

export const relayerOperations = pgTable(
  "relayer_operations",
  {
    id: text("id").primaryKey(),
    networkId: text("network_id").notNull().references(() => networks.id),
    kind: text("kind").notNull(), // CREATE_VAULT | DEPLOY_AND_SWEEP | WALLET_PAYMENT | FORWARD
    status: text("status").notNull().default("QUEUED"), // QUEUED | SUBMITTED | CONFIRMED | REVERTED | FAILED | CANCELLED
    dedupeKey: text("dedupe_key").notNull(),
    toAddress: text("to_address").notNull(),
    calldata: text("calldata").notNull(),
    relatedType: text("related_type"),
    relatedId: text("related_id"),
    signerAddress: text("signer_address"),
    nonce: bigint("nonce", { mode: "bigint" }),
    txHash: text("tx_hash"),
    /** Signed raw transaction persisted BEFORE broadcast so a crash can safely rebroadcast the same tx. */
    rawTx: text("raw_tx"),
    txHashes: jsonb("tx_hashes").$type<string[]>().notNull().default([]),
    gasLimit: bigint("gas_limit", { mode: "bigint" }),
    maxFeePerGas: bigint("max_fee_per_gas", { mode: "bigint" }),
    maxPriorityFeePerGas: bigint("max_priority_fee_per_gas", { mode: "bigint" }),
    gasUsed: bigint("gas_used", { mode: "bigint" }),
    effectiveGasPrice: bigint("effective_gas_price", { mode: "bigint" }),
    feeNativeWei: bigint("fee_native_wei", { mode: "bigint" }),
    feeUsdcUnits: money("fee_usdc_units"), // set only where the native unit is USDC (Arc)
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    createdAt: createdAt(),
    submittedAt: ts("submitted_at"),
    confirmedAt: ts("confirmed_at"),
  },
  (t) => [
    uniqueIndex("relayer_ops_dedupe_uq").on(t.dedupeKey),
    index("relayer_ops_status_idx").on(t.networkId, t.status),
    index("relayer_ops_related_idx").on(t.relatedType, t.relatedId),
  ],
);

export const relayerState = pgTable("relayer_state", {
  networkId: text("network_id").primaryKey().references(() => networks.id),
  paused: boolean("paused").notNull().default(false),
  pauseReason: text("pause_reason"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: text("id").primaryKey(),
    paymentIntentId: text("payment_intent_id").notNull().references(() => paymentIntents.id),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    method: text("method").notNull(), // WALLET | ADDRESS
    status: text("status").notNull().default("PREPARED"), // PREPARED | SUBMITTED | CONFIRMED | FAILED | EXPIRED
    payer: text("payer"),
    amount: money("amount"),
    // Public, non-secret authorization fields (what the wallet signed). The signature is wiped after submit.
    authorization: jsonb("authorization").$type<Record<string, string> | null>(),
    nonce: text("nonce"),
    relayerOperationId: text("relayer_operation_id").references(() => relayerOperations.id),
    txHash: text("tx_hash"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("payment_attempts_intent_idx").on(t.paymentIntentId),
    uniqueIndex("payment_attempts_nonce_uq").on(t.networkId, t.payer, t.nonce).where(sql`${t.nonce} is not null`),
  ],
);

/** Every observed on-chain movement. Incoming ERC-20 transfers are unique per (network, tx, log index). */
export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    networkId: text("network_id").notNull().references(() => networks.id),
    txHash: text("tx_hash").notNull(),
    logIndex: integer("log_index").notNull().default(-1),
    kind: text("kind").notNull(), // INCOMING_TRANSFER | WALLET_PAYMENT | SWEEP | FORWARD | REFUND | VAULT_CREATE
    merchantId: text("merchant_id").references(() => merchants.id),
    paymentIntentId: text("payment_intent_id").references(() => paymentIntents.id),
    invoiceAddressId: text("invoice_address_id").references(() => invoiceAddresses.id),
    tokenAddress: text("token_address"),
    isOfficialAsset: boolean("is_official_asset").notNull().default(true),
    fromAddress: text("from_address"),
    toAddress: text("to_address"),
    amount: money("amount").notNull().default(sql`0`),
    /** Platform fee carried by this movement (SWEEP and WALLET_PAYMENT rows); `amount` is always the gross. */
    feeAmount: money("fee_amount"),
    blockNumber: bigint("block_number", { mode: "bigint" }),
    blockHash: text("block_hash"),
    blockTimestamp: ts("block_timestamp"),
    status: text("status").notNull().default("DETECTED"), // DETECTED | CONFIRMING | FINAL | REORGED
    confirmations: integer("confirmations").notNull().default(0),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    verifiedAt: ts("verified_at"),
    finalizedAt: ts("finalized_at"),
    reorgedAt: ts("reorged_at"),
  },
  (t) => [
    uniqueIndex("transactions_chain_tx_log_uq").on(t.networkId, t.txHash, t.logIndex),
    index("transactions_intent_idx").on(t.paymentIntentId),
    index("transactions_status_idx").on(t.networkId, t.status),
  ],
);

export const settlements = pgTable(
  "settlements",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    paymentIntentId: text("payment_intent_id").references(() => paymentIntents.id),
    invoiceAddressId: text("invoice_address_id").references(() => invoiceAddresses.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    kind: text("kind").notNull().default("SWEEP"), // SWEEP | FORWARD
    status: text("status").notNull().default("QUEUED"), // QUEUED | SUBMITTED | CONFIRMED | FAILED
    attemptNo: integer("attempt_no").notNull().default(1),
    vaultAddress: text("vault_address"),
    destinationKind: text("destination_kind").notNull().default("VAULT"),
    destinationAddress: text("destination_address").notNull(),
    expectedAmount: money("expected_amount").notNull(),
    sweptAmount: money("swept_amount"),
    /** Fee taken and net delivered, known once the sweep is observed. Fee is 0 when it was skipped. */
    feeAmount: money("fee_amount"),
    netAmount: money("net_amount"),
    relayerOperationId: text("relayer_operation_id").references(() => relayerOperations.id),
    txHash: text("tx_hash"),
    failureReason: text("failure_reason"),
    createdAt: createdAt(),
    submittedAt: ts("submitted_at"),
    confirmedAt: ts("confirmed_at"),
  },
  (t) => [
    index("settlements_intent_idx").on(t.paymentIntentId),
    index("settlements_merchant_idx").on(t.merchantId, t.createdAt),
    // At most one in-flight sweep per invoice address: prevents duplicate settlements.
    uniqueIndex("settlements_open_per_address_uq")
      .on(t.invoiceAddressId)
      .where(sql`${t.status} in ('QUEUED','SUBMITTED') and ${t.kind} = 'SWEEP'`),
  ],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    paymentIntentId: text("payment_intent_id").references(() => paymentIntents.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    /** DETECTED | VERIFIED | FINALIZED | SETTLED_TO_VAULT | FORWARDED | REFUNDED | GAS_COST */
    account: text("account").notNull(),
    direction: text("direction").notNull(), // CREDIT | DEBIT (debit = reversal / outflow)
    amount: money("amount").notNull(),
    refType: text("ref_type").notNull(),
    refId: text("ref_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("ledger_idempotency_uq").on(t.idempotencyKey),
    index("ledger_merchant_account_idx").on(t.merchantId, t.account),
    index("ledger_intent_idx").on(t.paymentIntentId),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    paymentIntentId: text("payment_intent_id").notNull().references(() => paymentIntents.id),
    networkId: text("network_id").notNull().references(() => networks.id),
    amount: money("amount").notNull(),
    recipient: text("recipient").notNull(),
    reason: text("reason"),
    /** REQUESTED -> COMPLETED (after the vault->recipient transfer is verified on-chain) | REJECTED */
    status: text("status").notNull().default("REQUESTED"),
    txHash: text("tx_hash"),
    logIndex: integer("log_index"),
    createdAt: createdAt(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("refunds_intent_idx").on(t.paymentIntentId), uniqueIndex("refunds_tx_uq").on(t.txHash, t.logIndex).where(sql`${t.txHash} is not null`)],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    environment: text("environment").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    /** AES-256-GCM encrypted signing secret (needed to compute HMACs). */
    secretEnc: text("secret_enc").notNull(),
    events: text("events").array().notNull(),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | DISABLED
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    disabledReason: text("disabled_reason"),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_endpoints_merchant_idx").on(t.merchantId)],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    environment: text("environment").notNull(),
    type: text("type").notNull(),
    paymentIntentId: text("payment_intent_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** Prevents emitting the same logical event twice (e.g. "payment.confirmed:pi_x"). */
    dedupeKey: text("dedupe_key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("webhook_events_dedupe_uq").on(t.dedupeKey), index("webhook_events_merchant_idx").on(t.merchantId, t.createdAt)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull().references(() => webhookEvents.id),
    endpointId: text("endpoint_id").notNull().references(() => webhookEndpoints.id),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    status: text("status").notNull().default("PENDING"), // PENDING | SUCCEEDED | RETRYING | ABANDONED
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at"),
    lastStatusCode: integer("last_status_code"),
    lastError: text("last_error"),
    lastAttemptAt: ts("last_attempt_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("webhook_deliveries_event_endpoint_uq").on(t.eventId, t.endpointId),
    index("webhook_deliveries_due_idx").on(t.status, t.nextAttemptAt),
  ],
);

export const webhookAttempts = pgTable("webhook_attempts", {
  id: text("id").primaryKey(),
  deliveryId: text("delivery_id").notNull().references(() => webhookDeliveries.id),
  attemptNumber: integer("attempt_number").notNull(),
  statusCode: integer("status_code"),
  error: text("error"),
  durationMs: integer("duration_ms"),
  responseSnippet: text("response_snippet"),
  attemptedAt: ts("attempted_at").notNull().defaultNow(),
});

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: text("id").primaryKey(),
    paymentIntentId: text("payment_intent_id").notNull().references(() => paymentIntents.id),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("payment_events_intent_idx").on(t.paymentIntentId, t.createdAt)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id"),
    actorType: text("actor_type").notNull(), // USER | API_KEY | SYSTEM | RELAYER
    actorId: text("actor_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_events_merchant_idx").on(t.merchantId, t.createdAt)],
);

export const watcherCursors = pgTable("watcher_cursors", {
  networkId: text("network_id").primaryKey().references(() => networks.id),
  lastScannedBlock: bigint("last_scanned_block", { mode: "bigint" }).notNull(),
  lastBlockHash: text("last_block_hash"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Generic durable job queue (transactional outbox). Workers claim rows with FOR UPDATE SKIP LOCKED. */
export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    queue: text("queue").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    dedupeKey: text("dedupe_key"),
    status: text("status").notNull().default("PENDING"), // PENDING | RUNNING | DONE | FAILED
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    runAt: ts("run_at").notNull().defaultNow(),
    lockedUntil: ts("locked_until"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    finishedAt: ts("finished_at"),
  },
  (t) => [
    index("jobs_due_idx").on(t.queue, t.status, t.runAt),
    uniqueIndex("jobs_dedupe_uq").on(t.queue, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull(),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<unknown>(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("idempotency_merchant_key_uq").on(t.merchantId, t.key)],
);
