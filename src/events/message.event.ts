import { Message } from "discord.js";
import { moderationService } from "../services/moderation.service";
import { geminiService } from "../services/gemini.service";
import { logger } from "../utils/logger";

export async function execute(message: Message) {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  try {
    // === Moderation Checks ===

    // Check for spam
    const isSpam = await moderationService.checkSpam(message);
    if (isSpam) {
      await moderationService.handleSpam(message);
      return;
    }

    // Check for badwords
    const hasBadword = moderationService.checkBadwords(message.content);
    if (hasBadword) {
      await moderationService.handleBadword(message);
      return;
    }

    // Check for unauthorized links
    const hasUnauthorizedLink = moderationService.checkUnauthorizedLinks(
      message.content,
      ["youtube.com", "youtu.be", "discord.gg", "twitter.com", "x.com"] // Basic whitelist
    );
    if (hasUnauthorizedLink) {
      await moderationService.handleUnauthorizedLink(message);
      return;
    }

    // === Bot Interactions ===

    // Check if bot is mentioned
    if (message.mentions.has(message.client.user!.id)) {
      await handleMention(message);
      return;
    }

    // Log message for audit (optional, can be heavy)
    // await moderationService.logMessageAction(message, 'sent');
  } catch (error) {
    logger.error("Error in messageCreate event:", error);
  }
}

/**
 * Handle when Shee is mentioned
 */
async function handleMention(message: Message): Promise<void> {
  try {
    // Extract question/comment (remove mention)
    const content = message.content.replace(/<@!?\d+>/g, "").trim();

    if (!content) {
      // Just mentioned without text
      await message.reply("☕ Iya? Ada yang bisa Shee bantu? 💚");
      return;
    }

    // Show typing indicator
    await message.channel.sendTyping();

    // Generate friendly AI response
    const response = await geminiService.generateFriendlyResponse(content);

    // Reply to message
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
    logger.error("Error handling mention:", error);

    // Fallback response
    await message.reply({
      content: "🫖 Maaf ya, Shee lagi agak bingung nih~ Coba tanya lagi nanti?",
    });
  }
}
