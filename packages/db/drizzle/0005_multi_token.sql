DROP INDEX "merchant_vaults_merchant_network_uq";--> statement-breakpoint
ALTER TABLE "invoice_addresses" ADD COLUMN "token_symbol" text DEFAULT 'USDC' NOT NULL;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD COLUMN "asset" text DEFAULT 'USDC' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchant_vaults" ADD COLUMN "token_symbol" text DEFAULT 'USDC' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_links" ADD COLUMN "currency" text DEFAULT 'USDC' NOT NULL;--> statement-breakpoint
ALTER TABLE "relayer_operations" ADD COLUMN "token_symbol" text DEFAULT 'USDC' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_vaults_merchant_network_token_uq" ON "merchant_vaults" USING btree ("merchant_id","network_id","token_symbol");