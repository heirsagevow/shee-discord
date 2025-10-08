import { SheeBot } from "./bot";
import { cfg } from "./utils/config";
import { logger } from "./utils/logger";
import { testConnection, closeDatabase } from "./integrations/drizzle/db";

const logStartupInfo = () => {
  logger.info("🚀 Starting Shee - The Soft Guardian...");
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`Gemini API Keys: ${cfg.GEMINI_API_KEYS.length} available`);
};

const ensureDatabaseConnected = async (): Promise<void> => {
  const isConnected = await testConnection();
  if (!isConnected) {
    logger.error("❌ Failed to connect to database");
    process.exit(1);
  }
};

const setupGracefulShutdown = (bot: SheeBot) => {
  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await closeDatabase();
    await bot.shutdown();
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
};

async function main() {
  logStartupInfo();
  await ensureDatabaseConnected();

  const bot = new SheeBot();
  await bot.start(cfg.DISCORD_TOKEN);

  setupGracefulShutdown(bot);
}

main().catch((error) => {
  logger.error("Fatal error:", error);
  process.exit(1);
});
