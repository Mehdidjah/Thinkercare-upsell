ALTER TABLE "tc_call_meta" ADD COLUMN "ecomanager_order_id" text;--> statement-breakpoint
ALTER TABLE "tc_call_meta" ADD COLUMN "order_check" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "tc_call_meta" ADD COLUMN "order_state_group" text;--> statement-breakpoint
ALTER TABLE "tc_call_meta" ADD COLUMN "order_state_name" text;--> statement-breakpoint
ALTER TABLE "tc_call_meta" ADD COLUMN "order_state_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tc_call_meta" ADD COLUMN "order_synced_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tc_meta_ecomanager_order" ON "tc_call_meta" USING btree ("ecomanager_order_id");--> statement-breakpoint
CREATE INDEX "tc_meta_order_sync" ON "tc_call_meta" USING btree ("order_check","order_synced_at");