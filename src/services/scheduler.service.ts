import cron from "node-cron";
import { Client, TextChannel } from "discord.js";
import { logger } from "@/utils/logger";
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

type MoodType = "motivational" | "chill" | "energetic";

const CRON_SCHEDULES = {
  morningCheck: "* * * * *",
  randomChat: "0 * * * *",
  templateGeneration: "0 3 * * *",
} as const;

const RANDOM_CHAT_CHANCE = 0.3;
const EMBED_COLOR = {
  morning: 0xffd700,
  coffee: 0xe8c5a5,
} as const;

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

  initialize(client: Client): void {
    this.client = client;
    this.startScheduledJobs();
    logger.info("✅ Scheduler initialized");
  }

  private startScheduledJobs(): void {
    cron.schedule(CRON_SCHEDULES.morningCheck, () =>
      this.checkMorningMessages()
    );

    if (cfg.ENABLE_RANDOM_CHAT) {
      cron.schedule(CRON_SCHEDULES.randomChat, () => this.checkRandomChat());
    }

    cron.schedule(CRON_SCHEDULES.templateGeneration, () =>
      this.checkTemplates()
    );

    logger.info("✅ Scheduled jobs started");
  }

  private getCurrentTimeString(): string {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, "0")}:${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  }

  private async getGuildsWithMorningTime(time: string) {
    return db.select().from(guilds).where(eq(guilds.morningMessageTime, time));
  }

  private async checkMorningMessages(): Promise<void> {
    try {
      const currentTime = this.getCurrentTimeString();
      const guildList = await this.getGuildsWithMorningTime(currentTime);

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

  private getRandomMood(): MoodType {
    const moods: MoodType[] = ["motivational", "chill", "energetic"];
    return moods[Math.floor(Math.random() * moods.length)];
  }

  private async fetchChannel(channelId: string): Promise<TextChannel | null> {
    if (!this.client) return null;

    try {
      const channel = (await this.client.channels.fetch(
        channelId
      )) as TextChannel;
      return channel?.isTextBased() ? channel : null;
    } catch {
      return null;
    }
  }

  private async sendMorningMessage(
    guildId: string,
    channelId: string
  ): Promise<void> {
    try {
      const channel = await this.fetchChannel(channelId);
      if (!channel) return;

      const mood = this.getRandomMood();
      const template = await templateService.getMorningMessageTemplate(mood);

      await channel.send({
        content: `☀️ Selamat pagi semuanya!\n\n${template.content}`,
        embeds: [
          {
            color: EMBED_COLOR.morning,
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

  private async getGuildsWithRandomChatEnabled() {
    return db.select().from(guilds).where(eq(guilds.randomChatEnabled, true));
  }

  private shouldSendRandomChat(): boolean {
    return Math.random() < RANDOM_CHAT_CHANCE;
  }

  private async checkRandomChat(): Promise<void> {
    try {
      const guildList = await this.getGuildsWithRandomChatEnabled();

      for (const guild of guildList) {
        if (this.shouldSendRandomChat()) {
          await this.sendRandomChat(guild.id, guild.randomChatChannels ?? []);
        }
      }
    } catch (error) {
      logger.error("Error checking random chat:", error);
    }
  }

  private getRandomChannel(channelIds: string[]): string {
    return channelIds[Math.floor(Math.random() * channelIds.length)];
  }

  private async logRandomChat(
    guildId: string,
    channelId: string,
    content: string
  ): Promise<void> {
    const log: NewRandomChatLog = {
      guildId,
      channelId,
      content,
      aiGenerated: true,
    };

    await db.insert(randomChatLogs).values(log);
  }

  private async sendRandomChat(
    guildId: string,
    channelIds: string[]
  ): Promise<void> {
    try {
      if (!this.client || channelIds.length === 0) return;

      const channelId = this.getRandomChannel(channelIds);
      const channel = await this.fetchChannel(channelId);
      if (!channel) return;

      const message = await geminiService.generateRandomChatMessage();
      await channel.send(message);

      await this.logRandomChat(guildId, channelId, message);
      logger.info(`Random chat sent to guild ${guildId}`);
    } catch (error) {
      logger.error(`Error sending random chat to guild ${guildId}:`, error);
    }
  }

  private async checkTemplates(): Promise<void> {
    try {
      logger.info("Checking template inventory...");

      const stats = await templateService.getTemplateStats();

      if (stats.welcome.total < 20) {
        logger.info("Generating new welcome templates...");
        await templateService.generateWelcomeTemplates(50);
      }

      if (stats.morning.total < 15) {
        logger.info("Generating new morning templates...");
        await templateService.generateMorningTemplates(20);
      }

      logger.info("Template check completed");
    } catch (error) {
      logger.error("Error checking templates:", error);
    }
  }

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
      if (!channels || channels.length === 0) return false;

      await this.sendRandomChat(guildId, channels);
      return true;
    } catch (error) {
      logger.error("Error triggering random chat:", error);
      return false;
    }
  }
}

export const schedulerService = SchedulerService.getInstance();
