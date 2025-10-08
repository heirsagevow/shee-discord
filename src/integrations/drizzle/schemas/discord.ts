import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  timestamp,
  varchar,
  jsonb,
} from "drizzle-orm/pg-core";

// Guilds Configuration
export const guilds = pgTable("guilds", {
  id: text("id").primaryKey(),
  welcomeChannelId: text("welcome_channel_id"),
  morningMessageChannelId: text("morning_message_channel_id"),
  morningMessageTime: text("morning_message_time").default("09:00"),
  randomChatEnabled: boolean("random_chat_enabled").default(false),
  randomChatChannels: text("random_chat_channels").array().default([]),
  randomChatFrequencyHours: integer("random_chat_frequency_hours").default(6),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Welcome Message Templates (AI Generated)
export const welcomeTemplates = pgTable("welcome_templates", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  embedData: jsonb("embed_data"),
  usedCount: integer("used_count").default(0).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

// Daily Morning Messages
export const morningMessageTemplates = pgTable("morning_message_templates", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  moodTag: varchar("mood_tag", { length: 50 }),
  usedCount: integer("used_count").default(0).notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

// Warning/Reminder Templates
export const warningTemplates = pgTable("warning_templates", {
  id: serial("id").primaryKey(),
  type: varchar("type", { length: 50 }).notNull(),
  content: text("content").notNull(),
  severity: varchar("severity", { length: 20 }).notNull(),
});

// User Interactions & Mood Tracking
export const userMoods = pgTable("user_moods", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  mood: varchar("mood", { length: 20 }),
  gratitude: text("gratitude"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Message Logs (for both bots)
export const messageLogs = pgTable("message_logs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  channelId: text("channel_id").notNull(),
  messageId: text("message_id").notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  content: text("content"),
  botName: varchar("bot_name", { length: 10 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// User Warnings (shared by both bots)
export const userWarnings = pgTable("user_warnings", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id").notNull(),
  warnedBy: varchar("warned_by", { length: 10 }).notNull(),
  reason: text("reason"),
  severity: integer("severity").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Shee's Random Chat Schedule
export const randomChatLogs = pgTable("random_chat_logs", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  channelId: text("channel_id").notNull(),
  content: text("content").notNull(),
  aiGenerated: boolean("ai_generated").default(false).notNull(),
  sentAt: timestamp("sent_at").defaultNow().notNull(),
});

// Type exports for TypeScript
export type Guild = typeof guilds.$inferSelect;
export type NewGuild = typeof guilds.$inferInsert;

export type WelcomeTemplate = typeof welcomeTemplates.$inferSelect;
export type NewWelcomeTemplate = typeof welcomeTemplates.$inferInsert;

export type MorningMessageTemplate =
  typeof morningMessageTemplates.$inferSelect;
export type NewMorningMessageTemplate =
  typeof morningMessageTemplates.$inferInsert;

export type WarningTemplate = typeof warningTemplates.$inferSelect;
export type NewWarningTemplate = typeof warningTemplates.$inferInsert;

export type UserMood = typeof userMoods.$inferSelect;
export type NewUserMood = typeof userMoods.$inferInsert;

export type MessageLog = typeof messageLogs.$inferSelect;
export type NewMessageLog = typeof messageLogs.$inferInsert;

export type UserWarning = typeof userWarnings.$inferSelect;
export type NewUserWarning = typeof userWarnings.$inferInsert;

export type RandomChatLog = typeof randomChatLogs.$inferSelect;
export type NewRandomChatLog = typeof randomChatLogs.$inferInsert;
