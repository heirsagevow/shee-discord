import { Client, ActivityType } from "discord.js";
import { logger } from "@/utils/logger";
import { schedulerService } from "@/services/scheduler.service";
import { templateService } from "@/services/template.service";

export const once = true;

const MIN_TEMPLATE_THRESHOLDS = {
  welcome: 20,
  morning: 10,
  warning: 10,
} as const;

const GENERATION_COUNTS = {
  welcome: 50,
  morning: 20,
  warning: 30,
} as const;

const setBotStatus = (client: Client) => {
  client.user?.setPresence({
    activities: [
      {
        name: "coffee brewing ☕",
        type: ActivityType.Watching,
      },
    ],
    status: "online",
  });
};

const logStartupInfo = (client: Client) => {
  logger.info(`✅ Shee bot is ready! Logged in as ${client.user?.tag}`);
  logger.info(`📊 Serving ${client.guilds.cache.size} guilds`);
};

const shouldGenerateTemplates = (count: number, threshold: number): boolean =>
  count < threshold;

const generateInitialTemplates = async (stats: {
  welcome: { total: number };
  morning: { total: number };
  warning: { total: number };
}) => {
  if (
    shouldGenerateTemplates(
      stats.welcome.total,
      MIN_TEMPLATE_THRESHOLDS.welcome
    )
  ) {
    logger.info("Generating initial welcome templates...");
    await templateService.generateWelcomeTemplates(GENERATION_COUNTS.welcome);
  }

  if (
    shouldGenerateTemplates(
      stats.morning.total,
      MIN_TEMPLATE_THRESHOLDS.morning
    )
  ) {
    logger.info("Generating initial morning templates...");
    await templateService.generateMorningTemplates(GENERATION_COUNTS.morning);
  }

  if (stats.warning.total < MIN_TEMPLATE_THRESHOLDS.welcome) {
    logger.info("Generating initial warning templates...");
    await templateService.generateWarningTemplates(GENERATION_COUNTS.welcome);
  }
};

const initializeTemplates = async () => {
  try {
    const stats = await templateService.getTemplateStats();
    logger.info("📝 Template Stats:", stats);
    await generateInitialTemplates(stats);
  } catch (error) {
    logger.error("Error checking templates on startup:", error);
  }
};

export async function execute(client: Client) {
  if (!client.user) return;

  logStartupInfo(client);
  setBotStatus(client);
  schedulerService.initialize(client);
  await initializeTemplates();

  logger.info(
    `🚀 Shee is now fully operational at ${new Date().toISOString()}`
  );
}
