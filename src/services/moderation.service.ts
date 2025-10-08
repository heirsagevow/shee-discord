import { Message, GuildMember, TextChannel } from "discord.js";
import { logger } from "../utils/logger";
import { templateService } from "./template.service";
import { and, eq, gte, count } from "drizzle-orm";
import { cache } from "@/utils/cache";
import {
  messageLogs,
  userWarnings,
  type NewMessageLog,
  type NewUserWarning,
} from "@/integrations/drizzle/schemas/discord";
import { db } from "@/integrations/drizzle/db";

export class ModerationService {
  private static instance: ModerationService;

  // Configurable thresholds
  private readonly SPAM_MESSAGE_LIMIT = 5;
  private readonly SPAM_TIME_WINDOW = 10; // seconds
  private readonly WARNING_THRESHOLD = 3; // escalate after 3 warnings

  // Simple badword list (should be loaded from DB in production)
  private badwords = [
    "anjing",
    "kontol",
    "memek",
    "bangsat",
    "tolol",
    "babi",
    "kampret",
    "jancok",
    "tai",
    "fuck",
  ];

  private constructor() {}

  static getInstance(): ModerationService {
    if (!ModerationService.instance) {
      ModerationService.instance = new ModerationService();
    }
    return ModerationService.instance;
  }

  /**
   * Check if message is spam
   */
  async checkSpam(message: Message): Promise<boolean> {
    const key = `spam:${message.guildId}:${message.author.id}`;
    const count = await cache.increment(key, this.SPAM_TIME_WINDOW);

    if (count > this.SPAM_MESSAGE_LIMIT) {
      logger.warn(`Spam detected from ${message.author.tag}`);
      return true;
    }

    return false;
  }

  /**
   * Check if message contains badwords
   */
  checkBadwords(content: string): boolean {
    const lowerContent = content.toLowerCase();
    return this.badwords.some((word) => lowerContent.includes(word));
  }

  /**
   * Check if message contains unauthorized links
   */
  checkUnauthorizedLinks(content: string, whitelist: string[] = []): boolean {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = content.match(urlRegex);

    if (!urls) return false;

    // Check if any URL is not in whitelist
    return urls.some((url) => {
      return !whitelist.some((domain) => url.includes(domain));
    });
  }

  /**
   * Handle spam violation
   */
  async handleSpam(message: Message): Promise<void> {
    try {
      // Delete message
      await message.delete();

      // Get warning count
      const warningCount = await this.getWarningCount(
        message.author.id,
        message.guildId!
      );

      if (warningCount >= this.WARNING_THRESHOLD) {
        // Escalate to Hee'z (timeout)
        await this.escalateToHeez(message.member!, "spam", warningCount);
      } else {
        // Soft warning from Shee
        await this.sendSoftWarning(message, "spam");
        await this.recordWarning(message.author.id, message.guildId!, "spam");
      }
    } catch (error) {
      logger.error("Error handling spam:", error);
    }
  }

  /**
   * Handle badword violation
   */
  async handleBadword(message: Message): Promise<void> {
    try {
      // Delete message
      await message.delete();

      // Get warning count
      const warningCount = await this.getWarningCount(
        message.author.id,
        message.guildId!
      );

      if (warningCount >= this.WARNING_THRESHOLD) {
        await this.escalateToHeez(message.member!, "badword", warningCount);
      } else {
        await this.sendSoftWarning(message, "badword");
        await this.recordWarning(
          message.author.id,
          message.guildId!,
          "badword"
        );
      }
    } catch (error) {
      logger.error("Error handling badword:", error);
    }
  }

  /**
   * Handle unauthorized link
   */
  async handleUnauthorizedLink(message: Message): Promise<void> {
    try {
      await message.delete();
      await this.sendSoftWarning(message, "link");

      // Link violations don't count as warnings (just info)
      logger.info(`Removed unauthorized link from ${message.author.tag}`);
    } catch (error) {
      logger.error("Error handling link:", error);
    }
  }

  /**
   * Send soft warning using template
   */
  private async sendSoftWarning(
    message: Message,
    type: "spam" | "badword" | "link"
  ): Promise<void> {
    const template = await templateService.getWarningTemplate(type);

    if (!template) {
      logger.error(`No warning template found for type: ${type}`);
      return;
    }

    const warningMessage = template.content.replace(
      "{user}",
      `<@${message.author.id}>`
    );

    await message.channel.send({
      content: warningMessage,
      allowedMentions: { users: [message.author.id] },
    });
  }

  /**
   * Record warning in database
   */
  private async recordWarning(
    userId: string,
    guildId: string,
    reason: string
  ): Promise<void> {
    const warning: NewUserWarning = {
      userId,
      guildId,
      warnedBy: "shee",
      reason,
      severity: 1,
    };

    await db.insert(userWarnings).values(warning);
    logger.info(
      `Warning recorded for user ${userId} in guild ${guildId} (${reason})`
    );
  }

  /**
   * Get warning count for user
   */
  private async getWarningCount(
    userId: string,
    guildId: string
  ): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [result] = await db
      .select({ value: count() })
      .from(userWarnings)
      .where(
        and(
          eq(userWarnings.userId, userId),
          eq(userWarnings.guildId, guildId),
          eq(userWarnings.warnedBy, "shee"),
          gte(userWarnings.createdAt, sevenDaysAgo)
        )
      );

    return result.value;
  }

  /**
   * Escalate to Hee'z for heavier moderation
   */
  private async escalateToHeez(
    member: GuildMember,
    reason: string,
    warningCount: number
  ): Promise<void> {
    try {
      // Timeout user for 10 minutes
      await member.timeout(
        10 * 60 * 1000,
        `Escalated from Shee: ${reason} (${warningCount} warnings)`
      );

      // Send notification to channel
      const message = `🫖 ${member} sedang diistirahatkan 10 menit untuk menenangkan diri. Take a break and have some tea~ ☕`;

      // Find a suitable channel to send notification
      const channel = member.guild.channels.cache.find(
        (ch) => ch.isTextBased() && ch.name.includes("general")
      ) as TextChannel;

      if (channel) {
        await channel.send(message);
      }

      // Record escalation
      const warning: NewUserWarning = {
        userId: member.id,
        guildId: member.guild.id,
        warnedBy: "heez",
        reason: `Escalated from Shee: ${reason}`,
        severity: 3,
      };

      await db.insert(userWarnings).values(warning);
      logger.warn(
        `Escalated user ${member.user.tag} to Hee'z (${warningCount} warnings)`
      );
    } catch (error) {
      logger.error("Error escalating to Heez:", error);
    }
  }

  /**
   * Log message action to database
   */
  async logMessageAction(
    message: Message,
    action: "sent" | "edited" | "deleted"
  ): Promise<void> {
    try {
      const log: NewMessageLog = {
        guildId: message.guildId!,
        userId: message.author.id,
        channelId: message.channelId,
        messageId: message.id,
        action,
        content: message.content,
        botName: "shee",
      };

      await db.insert(messageLogs).values(log);
    } catch (error) {
      // Don't log errors for message logging to avoid spam
    }
  }
}

export const moderationService = ModerationService.getInstance();
