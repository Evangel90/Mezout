ALTER TABLE "merchants" ADD COLUMN "business_name" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "invoices_token_idx" ON "invoices" USING btree ("token");