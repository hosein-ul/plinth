CREATE TABLE "custody_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"network_id" text NOT NULL,
	"token_symbol" text NOT NULL,
	"schedule" text DEFAULT 'MANUAL' NOT NULL,
	"min_units" bigint DEFAULT 0 NOT NULL,
	"last_auto_payout_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custody_withdrawals" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"network_id" text NOT NULL,
	"token_symbol" text NOT NULL,
	"to_address" text NOT NULL,
	"amount" bigint NOT NULL,
	"status" text DEFAULT 'REQUESTED' NOT NULL,
	"trigger" text DEFAULT 'MANUAL' NOT NULL,
	"idempotency_key" text NOT NULL,
	"signer_address" text,
	"nonce" bigint,
	"raw_tx" text,
	"tx_hash" text,
	"gas_limit" bigint,
	"max_fee_per_gas" bigint,
	"max_priority_fee_per_gas" bigint,
	"gas_used" bigint,
	"fee_native_wei" bigint,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "invoice_addresses" ADD COLUMN "custodial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_intent_routes" ADD COLUMN "custodial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "custody_settings" ADD CONSTRAINT "custody_settings_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custody_settings" ADD CONSTRAINT "custody_settings_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custody_withdrawals" ADD CONSTRAINT "custody_withdrawals_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custody_withdrawals" ADD CONSTRAINT "custody_withdrawals_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custody_settings_uq" ON "custody_settings" USING btree ("merchant_id","network_id","token_symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "custody_withdrawals_idem_uq" ON "custody_withdrawals" USING btree ("merchant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "custody_withdrawals_status_idx" ON "custody_withdrawals" USING btree ("network_id","status");--> statement-breakpoint
CREATE INDEX "custody_withdrawals_merchant_idx" ON "custody_withdrawals" USING btree ("merchant_id","created_at");