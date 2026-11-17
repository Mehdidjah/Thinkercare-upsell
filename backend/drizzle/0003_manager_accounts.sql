ALTER TABLE "tc_users" DROP CONSTRAINT "tc_users_role_check";--> statement-breakpoint
ALTER TABLE "tc_users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tc_users" ADD CONSTRAINT "tc_users_role_check" CHECK ("tc_users"."role" IN ('admin','manager','advisor'));