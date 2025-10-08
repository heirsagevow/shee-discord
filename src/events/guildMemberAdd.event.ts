import type { GuildMember, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { db } from "@/integrations/drizzle/db";
import { guilds } from "@/integrations/drizzle/schemas/discord";
import { templateService } from "@/services/template.service";
import { logger } from "@/utils/logger";
import { eq } from "drizzle-orm";

const EMBED_COLOR = 0xe8c5a5;
const MEMBER_ROLE_NAME = "Member";

const getGuildConfig = async (guildId: string) => {
  const [config] = await db
    .select()
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);

  return config;
};

const getWelcomeChannel = (
  member: GuildMember,
  channelId: string
): TextChannel | null => {
  const channel = member.guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased() || channel.isDMBased()) {
    return null;
  }
  return channel as TextChannel;
};

const createWelcomeEmbed = (
  member: GuildMember,
  content: string
): EmbedBuilder =>
  new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`☕ Welcome, ${member.displayName}!`)
    .setDescription(content)
    .setThumbnail(member.user.displayAvatarURL())
    .setFooter({
      text: `Member #${member.guild.memberCount} • Shee`,
      iconURL: member.client.user?.displayAvatarURL(),
    })
    .setTimestamp();

const assignMemberRole = async (member: GuildMember): Promise<void> => {
  try {
    const memberRole = member.guild.roles.cache.find(
      (role) => role.name === MEMBER_ROLE_NAME
    );

    if (!memberRole) {
      logger.warn(`Member role '${MEMBER_ROLE_NAME}' not found`);
      return;
    }

    const botMember = member.guild.members.cache.get(member.client.user!.id);
    if (!botMember) {
      logger.warn("Could not find bot member in guild");
      return;
    }

    // Check if bot's highest role is lower than the role to be assigned
    if (memberRole.position >= botMember.roles.highest.position) {
      logger.info(
        `Skipping role assignment for ${member.user.tag} - role hierarchy restriction`
      );
      return;
    }

    await member.roles.add(memberRole);
    logger.info(`Assigned @Member role to ${member.user.tag}`);
  } catch (error) {
    logger.warn(`Could not assign role to ${member.user.tag} - skipping`);
  }
};

const sendWelcomeMessage = async (
  member: GuildMember,
  channel: TextChannel,
  content: string
): Promise<void> => {
  const embed = createWelcomeEmbed(member, content);

  await channel.send({
    content: `${member}`,
    embeds: [embed],
  });

  logger.info(
    `Welcome message sent for ${member.user.tag} in guild ${member.guild.name}`
  );
};

export async function execute(member: GuildMember) {
  try {
    const guildConfig = await getGuildConfig(member.guild.id);

    if (!guildConfig || !guildConfig.welcomeChannelId) {
      logger.debug(
        `No welcome channel configured for guild ${member.guild.id}`
      );
      return;
    }

    const channel = getWelcomeChannel(member, guildConfig.welcomeChannelId);

    if (!channel) {
      logger.error(
        `Welcome channel ${guildConfig.welcomeChannelId} not found or not text-based`
      );
      return;
    }

    const template = await templateService.getWelcomeTemplate();
    await sendWelcomeMessage(
      member,
      channel,
      template.content.replace("{user}", `<@${member.id}>`)
    );
    await assignMemberRole(member);
  } catch (error) {
    logger.error("Error in welcome event:", error);
  }
}
