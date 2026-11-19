ALTER TABLE "tc_calls" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tc_calls" ADD COLUMN "voided_by" text;--> statement-breakpoint
ALTER TABLE "tc_calls" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "tc_accepted_dossiers" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "tc_accepted_dossiers_active_ref" ON "tc_accepted_dossiers" USING btree ("order_ref") WHERE voided_at IS NULL;--> statement-breakpoint
ALTER TABLE "tc_accepted_dossiers" DROP CONSTRAINT "tc_accepted_dossiers_pkey";--> statement-breakpoint
ALTER TABLE "tc_accepted_dossiers" ADD CONSTRAINT "tc_accepted_dossiers_pkey" PRIMARY KEY("call_id");--> statement-breakpoint
ALTER TABLE "tc_sessions" ADD COLUMN "created_at" timestamp with time zone;