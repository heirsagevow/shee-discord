import type { Message } from "discord.js";
import { moderationService } from "@/services/moderation.service";
import { logger } from "@/utils/logger";

const shouldIgnoreMessage = (message: Message): boolean =>
  message.author.bot || !message.guild;

const performModerationChecks = async (message: Message): Promise<boolean> => {
  try {
    // const isSpam = await moderationService.checkSpam(message);
    // if (isSpam) {
    //   await moderationService.handleSpam(message);
    //   return true;
    // }

    // const hasBadword = moderationService.checkBadwords(message.content);
    // if (hasBadword) {
    //   await moderationService.handleBadword(message);
    //   return true;
    // }

    const hasUnauthorizedLink = moderationService.checkUnauthorizedLinks(
      message.content
    );
    if (hasUnauthorizedLink) {
      await moderationService.handleUnauthorizedLink(message);
      return true;
    }

    return false;
  } catch (error) {
    logger.error("Error in moderation checks:", error);
    return false;
  }
};

export async function execute(message: Message) {
  if (shouldIgnoreMessage(message)) return;

  try {
    // Perform moderation checks first
    const violationDetected = await performModerationChecks(message);
    if (violationDetected) return;
  } catch (error) {
    logger.error("Error in message event:", error);
  }
}
