CREATE TABLE IF NOT EXISTS "loan_alerts" (
	"borrower" text NOT NULL,
	"network" text DEFAULT 'testnet' NOT NULL,
	"url" text,
	"thresholds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"redemption" boolean DEFAULT false NOT NULL,
	"signed_at" timestamp with time zone NOT NULL,
	"breached_threshold" integer,
	"redemption_high" boolean DEFAULT false NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_alert_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "loan_alerts_network_borrower_pk" PRIMARY KEY("network","borrower")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "loan_alerts_active_idx" ON "loan_alerts" USING btree ("disabled_at");