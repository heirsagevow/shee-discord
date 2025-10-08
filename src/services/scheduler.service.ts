import cron from "node-cron";
import { Client, TextChannel } from "discord.js";
import { logger } from "../utils/logger";
import { eq } from "drizzle-orm";
import { cfg } from "@/utils/config";
import { db } from "@/integrations/drizzle/db";
import {
  guilds,
  randomChatLogs,
  type NewRandomChatLog,
} from "@/integrations/drizzle/schemas/discord";
import { templateService } from "./template.service";
import { geminiService } from "./gemini.service";

export class SchedulerService {
  private static instance: SchedulerService;
  private client: Client | null = null;

  private constructor() {}

  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  /**
   * Initialize scheduler with Discord client
   */
  initialize(client: Client): void {
    this.client = client;
    this.startScheduledJobs();
    logger.info("✅ Scheduler initialized");
  }

  /**
   * Start all scheduled jobs
   */
  private startScheduledJobs(): void {
    // Check for morning messages every minute
    cron.schedule("* * * * *", () => this.checkMorningMessages());

    // Random chat check every hour
    if (cfg.ENABLE_RANDOM_CHAT) {
      cron.schedule("0 * * * *", () => this.checkRandomChat());
    }

    // Template generation check (daily at 3 AM)
    cron.schedule("0 3 * * *", () => this.checkTemplates());

    logger.info("✅ Scheduled jobs started");
  }

  /**
   * Check and send morning messages
   */
  private async checkMorningMessages(): Promise<void> {
    try {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;

      const guildList = await db
        .select()
        .from(guilds)
        .where(eq(guilds.morningMessageTime, currentTime));

      for (const guild of guildList) {
        if (guild.morningMessageChannelId) {
          await this.sendMorningMessage(
            guild.id,
            guild.morningMessageChannelId
          );
        }
      }
    } catch (error) {
      logger.error("Error checking morning messages:", error);
    }
  }

  /**
   * Send morning message to a guild
   */
  private async sendMorningMessage(
    guildId: string,
    channelId: string
  ): Promise<void> {
    try {
      if (!this.client) return;

      const channel = (await this.client.channels.fetch(
        channelId
      )) as TextChannel;
      if (!channel || !channel.isTextBased()) return;

      // Random mood selection
      const moods: Array<"motivational" | "chill" | "energetic"> = [
        "motivational",
        "chill",
        "energetic",
      ];
      const mood = moods[Math.floor(Math.random() * moods.length)];

      const template = await templateService.getMorningMessageTemplate(mood);

      await channel.send({
        content: `☀️ Selamat pagi semuanya!\n\n${template.content}`,
        embeds: [
          {
            color: 0xffd700, // Gold color
            footer: { text: "☕ Shee • Have a great day!" },
            timestamp: new Date().toISOString(),
          },
        ],
      });

      logger.info(`Morning message sent to guild ${guildId}, mood: ${mood}`);
    } catch (error) {
      logger.error(`Error sending morning message to guild ${guildId}:`, error);
    }
  }

  /**
   * Check and send random chat messages
   */
  private async checkRandomChat(): Promise<void> {
    try {
      const guildList = await db
        .select()
        .from(guilds)
        .where(eq(guilds.randomChatEnabled, true));

      for (const guild of guildList) {
        // Random chance (30% per check)
        if (Math.random() < 0.3) {
          await this.sendRandomChat(guild.id, guild.randomChatChannels ?? []);
        }
      }
    } catch (error) {
      logger.error("Error checking random chat:", error);
    }
  }

  /**
   * Send random chat message
   */
  private async sendRandomChat(
    guildId: string,
    channelIds: string[]
  ): Promise<void> {
    try {
      if (!this.client || channelIds.length === 0) return;

      // Pick random channel
      const channelId =
        channelIds[Math.floor(Math.random() * channelIds.length)];
      const channel = (await this.client.channels.fetch(
        channelId
      )) as TextChannel;

      if (!channel || !channel.isTextBased()) return;

      // Generate casual message
      const message = await geminiService.generateRandomChatMessage();

      await channel.send(message);

      // Log to database
      const log: NewRandomChatLog = {
        guildId,
        channelId,
        content: message,
        aiGenerated: true,
      };

      await db.insert(randomChatLogs).values(log);
      logger.info(`Random chat sent to guild ${guildId}`);
    } catch (error) {
      logger.error(`Error sending random chat to guild ${guildId}:`, error);
    }
  }

  /**
   * Check and generate templates if needed
   */
  private async checkTemplates(): Promise<void> {
    try {
      logger.info("Checking template inventory...");

      const stats = await templateService.getTemplateStats();

      // Check welcome templates
      if (stats.welcome.total < 20) {
        logger.info("Generating new welcome templates...");
        await templateService.generateWelcomeTemplates(50);
      }

      // Check morning templates
      if (stats.morning.total < 15) {
        logger.info("Generating new morning templates...");
        await templateService.generateMorningTemplates(20);
      }

      logger.info("Template check completed");
    } catch (error) {
      logger.error("Error checking templates:", error);
    }
  }

  /**
   * Manually trigger morning message for a guild
   */
  async triggerMorningMessage(guildId: string): Promise<boolean> {
    try {
      const [guild] = await db
        .select()
        .from(guilds)
        .where(eq(guilds.id, guildId))
        .limit(1);

      if (!guild || !guild.morningMessageChannelId) {
        return false;
      }

      await this.sendMorningMessage(guildId, guild.morningMessageChannelId);
      return true;
    } catch (error) {
      logger.error("Error triggering morning message:", error);
      return false;
    }
  }

  /**
   * Manually trigger random chat for a guild
   */
  async triggerRandomChat(
    guildId: string,
    channelId?: string
  ): Promise<boolean> {
    try {
      const [guild] = await db
        .select()
        .from(guilds)
        .where(eq(guilds.id, guildId))
        .limit(1);

      if (!guild) return false;

      const channels = channelId ? [channelId] : guild.randomChatChannels;

      if (channels?.length === 0) return false;

      await this.sendRandomChat(guildId, channels ?? []);
      return true;
    } catch (error) {
      logger.error("Error triggering random chat:", error);
      return false;
    }
  }
}

export const schedulerService = SchedulerService.getInstance();
