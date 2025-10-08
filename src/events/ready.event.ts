import { Client, ActivityType } from "discord.js";
import { logger } from "../utils/logger";
import { schedulerService } from "../services/scheduler.service";
import { templateService } from "../services/template.service";

export const once = true;

export async function execute(client: Client) {
  if (!client.user) return;

  logger.info(`✅ Shee bot is ready! Logged in as ${client.user.tag}`);
  logger.info(`📊 Serving ${client.guilds.cache.size} guilds`);

  // Set bot status
  client.user.setPresence({
    activities: [
      {
        name: "coffee brewing ☕",
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  });

  // Initialize scheduler
  schedulerService.initialize(client);

  // Check template inventory on startup
  try {
    const stats = await templateService.getTemplateStats();
    logger.info("📝 Template Stats:", stats);

    // Generate initial templates if needed
    if (stats.welcome.total < 20) {
      logger.info("Generating initial welcome templates...");
      await templateService.generateWelcomeTemplates(50);
    }

    if (stats.morning.total < 10) {
      logger.info("Generating initial morning templates...");
      await templateService.generateMorningTemplates(20);
    }

    if (stats.warning.total === 0) {
      logger.info("Seeding warning templates...");
      await templateService.seedDefaultWarningTemplates();
    }
  } catch (error) {
    logger.error("Error checking templates on startup:", error);
  }

  // Log ready timestamp
  logger.info(
    `🚀 Shee is now fully operational at ${new Date().toISOString()}`
  );
}
