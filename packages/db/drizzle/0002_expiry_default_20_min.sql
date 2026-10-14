ALTER TABLE "merchants" ALTER COLUMN "default_expiry_seconds" SET DEFAULT 1200;--> statement-breakpoint
ALTER TABLE "payment_links" ALTER COLUMN "intent_expiry_seconds" SET DEFAULT 1200;