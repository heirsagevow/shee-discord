import type { Message } from "discord.js";
import { moderationService } from "@/services/moderation.service";
import { geminiService } from "@/services/gemini.service";
import { logger } from "@/utils/logger";
import {
  getErrorMessageProcessingMessage,
  getFallbackResponseMessage,
} from "@/data/messages";

const shouldIgnoreMessage = (message: Message): boolean =>
  message.author.bot || !message.guild;

const isBotMentioned = (message: Message): boolean =>
  message.mentions.has(message.client.user!.id);

const extractContentWithoutMentions = (content: string): string =>
  content.replace(/<@!?\d+>/g, "").trim();

const sendDefaultGreeting = async (message: Message): Promise<void> => {
  await message.reply("☕ Iya? Ada yang bisa Shee bantu? 💚");
};

const generateAIResponse = async (
  message: Message,
  content: string
): Promise<void> => {
  if (message.channel.isTextBased() && !message.channel.isDMBased()) {
    await message.channel.sendTyping();
  }

  try {
    const response = await geminiService.generateFriendlyResponse(content);

    // if (!response || response.trim().length === 0) {
    //   await message.reply({
    //     content:
    //       "Maaf, sepertinya aku sedang bingung. Bisa diulang pertanyaannya?",
    //     allowedMentions: { repliedUser: true },
    //   });
    //   return;
    // }

    await message.reply({
      content: response,
      allowedMentions: { repliedUser: true },
    });

    logger.info(
      `AI response sent to ${message.author.tag}: "${content.substring(
        0,
        50
      )}..."`
    );
  } catch (error) {
    logger.error("Error generating AI response:", error);
    await message.reply({
      content: getErrorMessageProcessingMessage(),
      allowedMentions: { repliedUser: true },
    });
  }
};

const sendFallbackResponse = async (message: Message): Promise<void> => {
  await message.reply({
    content: getFallbackResponseMessage(),
  });
};

const handleMention = async (message: Message): Promise<void> => {
  try {
    const content = extractContentWithoutMentions(message.content);

    if (!content) {
      await sendDefaultGreeting(message);
      return;
    }

    await generateAIResponse(message, content);
  } catch (error) {
    logger.error("Error handling mention:", error);
    await sendFallbackResponse(message);
  }
};

const performModerationChecks = async (message: Message): Promise<boolean> => {
  const isSpam = await moderationService.checkSpam(message);
  if (isSpam) {
    await moderationService.handleSpam(message);
    return true;
  }

  const hasBadword = moderationService.checkBadwords(message.content);
  if (hasBadword) {
    await moderationService.handleBadword(message);
    return true;
  }

  const hasUnauthorizedLink = moderationService.checkUnauthorizedLinks(
    message.content
  );
  if (hasUnauthorizedLink) {
    await moderationService.handleUnauthorizedLink(message);
    return true;
  }

  return false;
};

export async function execute(message: Message) {
  if (shouldIgnoreMessage(message)) return;

  try {
    const violationDetected = await performModerationChecks(message);
    if (violationDetected) return;

    if (isBotMentioned(message)) {
      await handleMention(message);
    }
  } catch (error) {
    logger.error("Error in message event:", error);
  }
}
