CREATE TABLE IF NOT EXISTS "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merchant_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"account_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "passkeys_public_key_unique" UNIQUE("public_key"),
	CONSTRAINT "passkeys_account_address_unique" UNIQUE("account_address")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passkeys_credential_idx" ON "passkeys" USING btree ("credential_id");