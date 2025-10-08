import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import "dotenv/config";

export const cfg = createEnv({
  server: {
    DISCORD_TOKEN: z.string().min(1),
    DISCORD_CLIENT_ID: z.string().min(1),
    DISCORD_GUILD_ID: z.string().min(1),

    DATABASE_URL: z.string(),

    REDIS_HOST: z.string(),
    REDIS_PORT: z.string().transform(Number).default("6379"),
    REDIS_USERNAME: z.string().default("default"),
    REDIS_PASSWORD: z.string(),

    GEMINI_API_KEYS: z.string().transform((str) =>
      str
        ? str
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : []
    ),

    LOG_LEVEL: z
      .enum(["error", "warn", "info", "http", "verbose", "debug", "silly"])
      .default("info"),

    ENABLE_RANDOM_CHAT: z
      .string()
      .transform((val) => val === "true" || val === "1")
      .default("false"),
  },
  runtimeEnv: process.env,
});
