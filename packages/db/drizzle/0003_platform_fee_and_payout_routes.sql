CREATE TABLE "merchant_payout_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"network_id" text NOT NULL,
	"mode" text NOT NULL,
	"address" text,
	"status" text DEFAULT 'PENDING_CONFIRMATION' NOT NULL,
	"proof_message" text,
	"proof_signature" text,
	"proof_signed_at" timestamp with time zone,
	"requested_by_user_id" text,
	"confirmation_token_hash" text,
	"confirmation_expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"active_from" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intent_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_intent_id" text NOT NULL,
	"network_id" text NOT NULL,
	"destination_kind" text NOT NULL,
	"destination_address" text NOT NULL,
	"fee_bps" integer NOT NULL,
	"treasury_address" text NOT NULL,
	"payout_config_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_challenges" (
	"nonce" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"network_id" text NOT NULL,
	"address" text NOT NULL,
	"purpose" text NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_addresses" ALTER COLUMN "vault_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ALTER COLUMN "vault_address" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_addresses" ADD COLUMN "destination_kind" text DEFAULT 'VAULT' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_addresses" ADD COLUMN "destination_address" text;--> statement-breakpoint
-- Existing rows were all vault-mode with no fee: their destination is the vault they already used.
UPDATE "invoice_addresses" SET "destination_address" = "vault_address" WHERE "destination_address" IS NULL;--> statement-breakpoint
ALTER TABLE "invoice_addresses" ALTER COLUMN "destination_address" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_addresses" ADD COLUMN "fee_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_addresses" ADD COLUMN "treasury_address" text;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "fee_bps" integer;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "fee_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "net_amount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "destination_kind" text DEFAULT 'VAULT' NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "destination_address" text;--> statement-breakpoint
-- Existing rows were all vault-mode with no fee: their destination is the vault they already used.
UPDATE "settlements" SET "destination_address" = "vault_address" WHERE "destination_address" IS NULL;--> statement-breakpoint
ALTER TABLE "settlements" ALTER COLUMN "destination_address" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "fee_amount" bigint;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "net_amount" bigint;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "fee_amount" bigint;--> statement-breakpoint
ALTER TABLE "merchant_payout_configs" ADD CONSTRAINT "merchant_payout_configs_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payout_configs" ADD CONSTRAINT "merchant_payout_configs_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intent_routes" ADD CONSTRAINT "payment_intent_routes_payment_intent_id_payment_intents_id_fk" FOREIGN KEY ("payment_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intent_routes" ADD CONSTRAINT "payment_intent_routes_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_challenges" ADD CONSTRAINT "payout_challenges_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_challenges" ADD CONSTRAINT "payout_challenges_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "merchant_payout_configs_lookup_idx" ON "merchant_payout_configs" USING btree ("merchant_id","network_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_payout_configs_token_uq" ON "merchant_payout_configs" USING btree ("confirmation_token_hash") WHERE "merchant_payout_configs"."confirmation_token_hash" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intent_routes_uq" ON "payment_intent_routes" USING btree ("payment_intent_id","network_id");--> statement-breakpoint
CREATE INDEX "payout_challenges_merchant_idx" ON "payout_challenges" USING btree ("merchant_id","created_at");