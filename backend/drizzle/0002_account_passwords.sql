ALTER TABLE "tc_users" ADD COLUMN "password_ciphertext" text;--> statement-breakpoint
ALTER TABLE "tc_users" ADD COLUMN "password_updated_at" timestamp with time zone;