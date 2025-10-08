import type { Message } from "discord.js";
import { moderationService } from "@/services/moderation.service";
import { geminiService } from "@/services/gemini.service";
import { logger } from "@/utils/logger";

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

  const response = await geminiService.generateFriendlyResponse(content);

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
};

const sendFallbackResponse = async (message: Message): Promise<void> => {
  await message.reply({
    content: "🫖 Maaf ya, Shee lagi agak bingung nih~ Coba tanya lagi nanti?",
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
    logger.error("Error in messageCreate event:", error);
  }
}
