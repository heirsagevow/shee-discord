CREATE TABLE "guilds" (
	"id" text PRIMARY KEY NOT NULL,
	"welcome_channel_id" text,
	"morning_message_channel_id" text,
	"morning_message_time" text DEFAULT '09:00',
	"random_chat_enabled" boolean DEFAULT false,
	"random_chat_channels" text[] DEFAULT '{}',
	"random_chat_frequency_hours" integer DEFAULT 6,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"message_id" text NOT NULL,
	"action" varchar(20) NOT NULL,
	"content" text,
	"bot_name" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "morning_message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"mood_tag" varchar(50),
	"used_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "random_chat_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"content" text NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_moods" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"mood" varchar(20),
	"gratitude" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_warnings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"guild_id" text NOT NULL,
	"warned_by" varchar(10) NOT NULL,
	"reason" text,
	"severity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warning_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"content" text NOT NULL,
	"severity" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "welcome_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"embed_data" jsonb,
	"used_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
