import { GuildMember, TextChannel, EmbedBuilder } from "discord.js";
import { db } from "../database/db";
import { guilds } from "../database/schema";
import { templateService } from "../services/template.service";
import { logger } from "../utils/logger";
import { eq } from "drizzle-orm";

export async function execute(member: GuildMember) {
  try {
    // Fetch guild config
    const [guildConfig] = await db
      .select()
      .from(guilds)
      .where(eq(guilds.id, member.guild.id))
      .limit(1);

    // If no config or no welcome channel, skip
    if (!guildConfig || !guildConfig.welcomeChannelId) {
      logger.debug(
        `No welcome channel configured for guild ${member.guild.id}`
      );
      return;
    }

    // Get welcome channel
    const channel = member.guild.channels.cache.get(
      guildConfig.welcomeChannelId
    ) as TextChannel;

    if (!channel || !channel.isTextBased()) {
      logger.error(
        `Welcome channel ${guildConfig.welcomeChannelId} not found or not text-based`
      );
      return;
    }

    // Get welcome template
    const template = await templateService.getWelcomeTemplate();

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0xe8c5a5) // Soft coffee color
      .setTitle(`☕ Selamat datang, ${member.displayName}!`)
      .setDescription(template.content)
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({
        text: `Member #${member.guild.memberCount} • Shee`,
        iconURL: member.client.user?.displayAvatarURL(),
      })
      .setTimestamp();

    // Send welcome message
    await channel.send({
      content: `${member}`,
      embeds: [embed],
    });

    logger.info(
      `Welcome message sent for ${member.user.tag} in guild ${member.guild.name}`
    );

    // Auto-assign member role if configured
    const memberRole = member.guild.roles.cache.find(
      (role) => role.name === "Member"
    );
    if (memberRole) {
      await member.roles.add(memberRole);
      logger.info(`Assigned @Member role to ${member.user.tag}`);
    }
  } catch (error) {
    logger.error("Error in guildMemberAdd event:", error);
  }
}
