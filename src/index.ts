import { SheeBot } from "./bot";
import { env } from "./config/env";
import { logger } from "./utils/logger";
import { testConnection, closeDatabase } from "./database/db";

async function main() {
  logger.info("🚀 Starting Shee - The Soft Guardian...");
  logger.info(`Environment: ${env.NODE_ENV}`);
  logger.info(`Gemini API Keys: ${env.geminiApiKeys.length} available`);

  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    logger.error("❌ Failed to connect to database");
    process.exit(1);
  }

  // Initialize bot
  const bot = new SheeBot();

  // Start bot
  await bot.start(env.DISCORD_TOKEN);

  // Handle process termination
  process.on("SIGINT", async () => {
    logger.info("Received SIGINT, shutting down gracefully...");
    await closeDatabase();
    await bot.shutdown();
  });

  process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM, shutting down gracefully...");
    await closeDatabase();
    await bot.shutdown();
  });
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
