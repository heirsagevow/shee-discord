ALTER TABLE "warning_templates" ADD COLUMN "used_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "warning_templates" ADD COLUMN "last_used_at" timestamp;