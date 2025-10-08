import { Message, GuildMember, TextChannel } from "discord.js";
import { logger } from "@/utils/logger";
import { templateService } from "./template.service";
import { and, eq, gte, count } from "drizzle-orm";
import { cache } from "@/utils/cache";
import { dataLoader } from "@/utils/data-loader";
import {
  messageLogs,
  userWarnings,
  type NewMessageLog,
  type NewUserWarning,
} from "@/integrations/drizzle/schemas/discord";
import { db } from "@/integrations/drizzle/db";
import { getEscalationMessage } from "@/data/messages";

type ViolationType = "spam" | "badword" | "link";
type MessageAction = "sent" | "edited" | "deleted";

const SPAM_CONFIG = {
  messageLimit: 5,
  timeWindowSeconds: 10,
} as const;

const MODERATION_CONFIG = {
  warningThreshold: 3,
  timeoutDurationMs: 10 * 60 * 1000,
  warningWindowDays: 7,
} as const;

export class ModerationService {
  private static instance: ModerationService;

  private constructor() {}

  static getInstance(): ModerationService {
    if (!ModerationService.instance) {
      ModerationService.instance = new ModerationService();
    }
    return ModerationService.instance;
  }

  private createSpamCacheKey(guildId: string, userId: string): string {
    return `spam:${guildId}:${userId}`;
  }

  private extractUrls(content: string): string[] | null {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return content.match(urlRegex);
  }

  private hasUnauthorizedUrls(urls: string[]): boolean {
    return urls.some((url) => !dataLoader.isUrlWhitelisted(url));
  }

  async checkSpam(message: Message): Promise<boolean> {
    const key = this.createSpamCacheKey(message.guildId!, message.author.id);
    const messageCount = await cache.increment(
      key,
      SPAM_CONFIG.timeWindowSeconds
    );

    const isSpam = messageCount > SPAM_CONFIG.messageLimit;

    if (isSpam) {
      logger.warn(`Spam detected from ${message.author.tag}`);
    }

    return isSpam;
  }

  checkBadwords(content: string): boolean {
    return dataLoader.containsBadword(content);
  }

  checkUnauthorizedLinks(content: string): boolean {
    const urls = this.extractUrls(content);
    if (!urls) return false;
    return this.hasUnauthorizedUrls(urls);
  }

  private async shouldEscalateToHeez(
    userId: string,
    guildId: string
  ): Promise<{ shouldEscalate: boolean; warningCount: number }> {
    const warningCount = await this.getWarningCount(userId, guildId);
    return {
      shouldEscalate: warningCount >= MODERATION_CONFIG.warningThreshold,
      warningCount,
    };
  }

  async handleSpam(message: Message): Promise<void> {
    try {
      await message.delete();

      const { shouldEscalate, warningCount } = await this.shouldEscalateToHeez(
        message.author.id,
        message.guildId!
      );

      if (shouldEscalate) {
        await this.escalateToHeez(message.member!, "spam", warningCount);
      } else {
        await this.sendSoftWarning(message, "spam");
        await this.recordWarning(message.author.id, message.guildId!, "spam");
      }
    } catch (error) {
      logger.error("Error handling spam:", error);
    }
  }

  async handleBadword(message: Message): Promise<void> {
    try {
      await message.delete();

      const { shouldEscalate, warningCount } = await this.shouldEscalateToHeez(
        message.author.id,
        message.guildId!
      );

      if (shouldEscalate) {
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

  async handleUnauthorizedLink(message: Message): Promise<void> {
    try {
      await message.delete();
      await this.sendSoftWarning(message, "link");
      logger.info(`Removed unauthorized link from ${message.author.tag}`);
    } catch (error) {
      logger.error("Error handling link:", error);
    }
  }

  private async sendSoftWarning(
    message: Message,
    type: ViolationType
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

    if (message.channel.isTextBased() && !message.channel.isDMBased()) {
      await message.channel.send({
        content: warningMessage,
        allowedMentions: { users: [message.author.id] },
      });
    }
  }

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

  private getWarningWindowDate(): Date {
    const daysAgo = MODERATION_CONFIG.warningWindowDays;
    return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  }

  private async getWarningCount(
    userId: string,
    guildId: string
  ): Promise<number> {
    const windowDate = this.getWarningWindowDate();

    const [result] = await db
      .select({ value: count() })
      .from(userWarnings)
      .where(
        and(
          eq(userWarnings.userId, userId),
          eq(userWarnings.guildId, guildId),
          eq(userWarnings.warnedBy, "shee"),
          gte(userWarnings.createdAt, windowDate)
        )
      );

    return result.value;
  }

  private findGeneralChannel(member: GuildMember): TextChannel | undefined {
    const channel = member.guild.channels.cache.find(
      (ch) => ch.isTextBased() && !ch.isDMBased() && ch.name.includes("general")
    );
    return channel as TextChannel | undefined;
  }

  private async sendEscalationNotification(member: GuildMember): Promise<void> {
    const message = getEscalationMessage(member);
    const channel = this.findGeneralChannel(member);

    if (channel) {
      await channel.send(message);
    }
  }

  private async recordEscalation(
    member: GuildMember,
    reason: string
  ): Promise<void> {
    const warning: NewUserWarning = {
      userId: member.id,
      guildId: member.guild.id,
      warnedBy: "heez",
      reason: `Escalated from Shee: ${reason}`,
      severity: 3,
    };

    await db.insert(userWarnings).values(warning);
  }

  private async escalateToHeez(
    member: GuildMember,
    reason: string,
    warningCount: number
  ): Promise<void> {
    try {
      await member.timeout(
        MODERATION_CONFIG.timeoutDurationMs,
        `Escalated from Shee: ${reason} (${warningCount} warnings)`
      );

      await this.sendEscalationNotification(member);
      await this.recordEscalation(member, reason);

      logger.warn(
        `Escalated user ${member.user.tag} to Hee'z (${warningCount} warnings)`
      );
    } catch (error) {
      logger.error("Error escalating to Heez:", error);
    }
  }

  async logMessageAction(
    message: Message,
    action: MessageAction
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
      // Silent fail to avoid log spam
    }
  }
}

export const moderationService = ModerationService.getInstance();
