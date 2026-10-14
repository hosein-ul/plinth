CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"environment" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"rotated_from_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"symbol" text NOT NULL,
	"address" text NOT NULL,
	"decimals" integer NOT NULL,
	"is_official" boolean DEFAULT true NOT NULL,
	"supports_receive_authorization" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_addresses" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_intent_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"network_id" text NOT NULL,
	"address" text NOT NULL,
	"vault_address" text NOT NULL,
	"merchant_id32" text NOT NULL,
	"invoice_id32" text NOT NULL,
	"factory_address" text NOT NULL,
	"implementation_address" text NOT NULL,
	"contract_version" integer NOT NULL,
	"created_block" bigint NOT NULL,
	"deployed_at" timestamp with time zone,
	"deploy_tx_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"payment_intent_id" text NOT NULL,
	"number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"memo" text,
	"line_items" jsonb NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"payment_intent_id" text,
	"network_id" text NOT NULL,
	"account" text NOT NULL,
	"direction" text NOT NULL,
	"amount" bigint NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_users" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'OWNER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "merchant_vaults" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"network_id" text NOT NULL,
	"owner_address" text NOT NULL,
	"vault_address" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"create_relayer_op_id" text,
	"create_tx_hash" text,
	"config_delay_seconds" integer NOT NULL,
	"cached_mode" text,
	"cached_destination" text,
	"cached_balance" bigint,
	"cached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"network_id" text NOT NULL,
	"kind" text NOT NULL,
	"address" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"underpayment_tolerance_bps" integer DEFAULT 0 NOT NULL,
	"overpayment_policy" text DEFAULT 'ACCEPT' NOT NULL,
	"default_expiry_seconds" integer DEFAULT 3600 NOT NULL,
	"invoice_seq" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "networks" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"name" text NOT NULL,
	"environment" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"operational" boolean DEFAULT false NOT NULL,
	"gate_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"deployment" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_intent_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"network_id" text NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'PREPARED' NOT NULL,
	"payer" text,
	"amount" bigint,
	"authorization" jsonb,
	"nonce" text,
	"relayer_operation_id" text,
	"tx_hash" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_intent_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"environment" text NOT NULL,
	"kind" text DEFAULT 'PAYMENT_INTENT' NOT NULL,
	"invoice_id32" text NOT NULL,
	"payment_link_id" text,
	"order_reference" text,
	"description" text,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'USDC' NOT NULL,
	"allowed_networks" text[] NOT NULL,
	"checkout_methods" text[] NOT NULL,
	"status" text DEFAULT 'CREATED' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"customer_email" text,
	"success_url" text,
	"cancel_url" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"amount_pending" bigint DEFAULT 0 NOT NULL,
	"amount_final" bigint DEFAULT 0 NOT NULL,
	"amount_eligible" bigint DEFAULT 0 NOT NULL,
	"amount_settled" bigint DEFAULT 0 NOT NULL,
	"amount_refunded" bigint DEFAULT 0 NOT NULL,
	"excess_amount" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_links" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"environment" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"amount" bigint NOT NULL,
	"allowed_networks" text[] NOT NULL,
	"checkout_methods" text[] NOT NULL,
	"success_url" text,
	"intent_expiry_seconds" integer DEFAULT 3600 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"payment_intent_id" text NOT NULL,
	"network_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"recipient" text NOT NULL,
	"reason" text,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"tx_hash" text,
	"log_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relayer_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"dedupe_key" text NOT NULL,
	"to_address" text NOT NULL,
	"calldata" text NOT NULL,
	"related_type" text,
	"related_id" text,
	"signer_address" text,
	"nonce" bigint,
	"tx_hash" text,
	"raw_tx" text,
	"tx_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"gas_limit" bigint,
	"max_fee_per_gas" bigint,
	"max_priority_fee_per_gas" bigint,
	"gas_used" bigint,
	"effective_gas_price" bigint,
	"fee_native_wei" bigint,
	"fee_usdc_units" bigint,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relayer_state" (
	"network_id" text PRIMARY KEY NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"pause_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"payment_intent_id" text,
	"invoice_address_id" text,
	"network_id" text NOT NULL,
	"kind" text DEFAULT 'SWEEP' NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"attempt_no" integer DEFAULT 1 NOT NULL,
	"vault_address" text NOT NULL,
	"expected_amount" bigint NOT NULL,
	"swept_amount" bigint,
	"relayer_operation_id" text,
	"tx_hash" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"network_id" text NOT NULL,
	"tx_hash" text NOT NULL,
	"log_index" integer DEFAULT -1 NOT NULL,
	"kind" text NOT NULL,
	"merchant_id" text,
	"payment_intent_id" text,
	"invoice_address_id" text,
	"token_address" text,
	"is_official_asset" boolean DEFAULT true NOT NULL,
	"from_address" text,
	"to_address" text,
	"amount" bigint DEFAULT 0 NOT NULL,
	"block_number" bigint,
	"block_hash" text,
	"block_timestamp" timestamp with time zone,
	"status" text DEFAULT 'DETECTED' NOT NULL,
	"confirmations" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"finalized_at" timestamp with time zone,
	"reorged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "watcher_cursors" (
	"network_id" text PRIMARY KEY NOT NULL,
	"last_scanned_block" bigint NOT NULL,
	"last_block_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"delivery_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status_code" integer,
	"error" text,
	"duration_ms" integer,
	"response_snippet" text,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_status_code" integer,
	"last_error" text,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"environment" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"secret_enc" text NOT NULL,
	"events" text[] NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"disabled_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"environment" text NOT NULL,
	"type" text NOT NULL,
	"payment_intent_id" text,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_addresses" ADD CONSTRAINT "invoice_addresses_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_addresses" ADD CONSTRAINT "invoice_addresses_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_addresses" ADD CONSTRAINT "invoice_addresses_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_users" ADD CONSTRAINT "merchant_users_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_vaults" ADD CONSTRAINT "merchant_vaults_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_vaults" ADD CONSTRAINT "merchant_vaults_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_wallets" ADD CONSTRAINT "merchant_wallets_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_wallets" ADD CONSTRAINT "merchant_wallets_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_relayer_operation_id_relayer_operations_id_fk" FOREIGN KEY ("relayer_operation_id") REFERENCES "public"."relayer_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payment_link_id_payment_links_id_fk" FOREIGN KEY ("payment_link_id") REFERENCES "public"."payment_links"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_links" ADD CONSTRAINT "payment_links_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relayer_operations" ADD CONSTRAINT "relayer_operations_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relayer_state" ADD CONSTRAINT "relayer_state_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_merchant_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."merchant_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_invoice_address_id_invoice_addresses_id_fk" FOREIGN KEY ("invoice_address_id") REFERENCES "public"."invoice_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_relayer_operation_id_relayer_operations_id_fk" FOREIGN KEY ("relayer_operation_id") REFERENCES "public"."relayer_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_invoice_address_id_invoice_addresses_id_fk" FOREIGN KEY ("invoice_address_id") REFERENCES "public"."invoice_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watcher_cursors" ADD CONSTRAINT "watcher_cursors_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_attempts" ADD CONSTRAINT "webhook_attempts_delivery_id_webhook_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."webhook_deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_event_id_webhook_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."webhook_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_hash_uq" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_merchant_idx" ON "api_keys" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assets_network_address_uq" ON "assets" USING btree ("network_id","address");--> statement-breakpoint
CREATE INDEX "audit_events_merchant_idx" ON "audit_events" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_merchant_key_uq" ON "idempotency_keys" USING btree ("merchant_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_addresses_net_addr_uq" ON "invoice_addresses" USING btree ("network_id","address");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_addresses_intent_net_uq" ON "invoice_addresses" USING btree ("payment_intent_id","network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("merchant_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_intent_uq" ON "invoices" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "jobs_due_idx" ON "jobs" USING btree ("queue","status","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_uq" ON "jobs" USING btree ("queue","dedupe_key") WHERE "jobs"."dedupe_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_idempotency_uq" ON "ledger_entries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "ledger_merchant_account_idx" ON "ledger_entries" USING btree ("merchant_id","account");--> statement-breakpoint
CREATE INDEX "ledger_intent_idx" ON "ledger_entries" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_users_email_uq" ON "merchant_users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "merchant_users_merchant_idx" ON "merchant_users" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_vaults_merchant_network_uq" ON "merchant_vaults" USING btree ("merchant_id","network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_vaults_address_uq" ON "merchant_vaults" USING btree ("network_id","vault_address");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_wallets_uq" ON "merchant_wallets" USING btree ("merchant_id","network_id","kind","address");--> statement-breakpoint
CREATE INDEX "payment_attempts_intent_idx" ON "payment_attempts" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_attempts_nonce_uq" ON "payment_attempts" USING btree ("network_id","payer","nonce") WHERE "payment_attempts"."nonce" is not null;--> statement-breakpoint
CREATE INDEX "payment_events_intent_idx" ON "payment_events" USING btree ("payment_intent_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_intents_merchant_created_idx" ON "payment_intents" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_intents_status_idx" ON "payment_intents" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_invoice_id32_uq" ON "payment_intents" USING btree ("invoice_id32");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_links_slug_uq" ON "payment_links" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "payment_links_merchant_idx" ON "payment_links" USING btree ("merchant_id");--> statement-breakpoint
CREATE INDEX "refunds_intent_idx" ON "refunds" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_tx_uq" ON "refunds" USING btree ("tx_hash","log_index") WHERE "refunds"."tx_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "relayer_ops_dedupe_uq" ON "relayer_operations" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "relayer_ops_status_idx" ON "relayer_operations" USING btree ("network_id","status");--> statement-breakpoint
CREATE INDEX "relayer_ops_related_idx" ON "relayer_operations" USING btree ("related_type","related_id");--> statement-breakpoint
CREATE INDEX "settlements_intent_idx" ON "settlements" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "settlements_merchant_idx" ON "settlements" USING btree ("merchant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_open_per_address_uq" ON "settlements" USING btree ("invoice_address_id") WHERE "settlements"."status" in ('QUEUED','SUBMITTED') and "settlements"."kind" = 'SWEEP';--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_chain_tx_log_uq" ON "transactions" USING btree ("network_id","tx_hash","log_index");--> statement-breakpoint
CREATE INDEX "transactions_intent_idx" ON "transactions" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("network_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_event_endpoint_uq" ON "webhook_deliveries" USING btree ("event_id","endpoint_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_merchant_idx" ON "webhook_endpoints" USING btree ("merchant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_dedupe_uq" ON "webhook_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "webhook_events_merchant_idx" ON "webhook_events" USING btree ("merchant_id","created_at");