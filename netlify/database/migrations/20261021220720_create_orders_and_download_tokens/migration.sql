CREATE TABLE "download_tokens" (
	"token_hash" text PRIMARY KEY,
	"order_id" text NOT NULL,
	"downloads" integer DEFAULT 0 NOT NULL,
	"max_downloads" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY,
	"product_id" text NOT NULL,
	"email" text NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	"amount_units" bigint NOT NULL,
	"chain_id" integer NOT NULL,
	"access_key_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"tx_hash" text UNIQUE,
	"payer_address" text,
	"block_number" bigint,
	"last_error" text,
	"email_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "download_tokens_order_idx" ON "download_tokens" ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_pending_amount_idx" ON "orders" ("chain_id","amount_units") WHERE "status" = 'pending';--> statement-breakpoint
CREATE INDEX "orders_status_expires_idx" ON "orders" ("status","expires_at");--> statement-breakpoint
ALTER TABLE "download_tokens" ADD CONSTRAINT "download_tokens_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id");