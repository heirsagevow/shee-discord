import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import "dotenv/config";

const parseCommaSeparatedKeys = (str: string): string[] =>
  str
    ? str
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

const parseBoolean = (val: string): boolean => val === "true" || val === "1";

export const cfg = createEnv({
  server: {
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_GUILD_ID: z.string().min(1),

    DATABASE_URL: z.string().url(),

    REDIS_HOST: z.string(),
    REDIS_PORT: z.string().transform(Number).default("6379"),
    REDIS_USERNAME: z.string().default("default"),
    REDIS_PASSWORD: z.string(),

    GEMINI_API_KEYS: z.string().transform(parseCommaSeparatedKeys),

    LOG_LEVEL: z
      .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
      .default("info"),

    ENABLE_RANDOM_CHAT: z.string().transform(parseBoolean).default("false"),
  },
  runtimeEnv: process.env,
});
