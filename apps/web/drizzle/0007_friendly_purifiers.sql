ALTER TABLE "merchants" DROP CONSTRAINT "merchants_payout_address_unique";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "network" text DEFAULT 'testnet' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD COLUMN "network" text DEFAULT 'testnet' NOT NULL;--> statement-breakpoint
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_network_payout_address_uq" UNIQUE("network","payout_address");