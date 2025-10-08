import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChatInputCommandInteraction,
  ChannelType,
} from "discord.js";
import { db } from "@/integrations/drizzle/db";
import { guilds } from "@/integrations/drizzle/schemas/discord";
import { eq } from "drizzle-orm";
import { logger } from "@/utils/logger";

export const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Setup Shee bot configuration")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand((subcommand) =>
    subcommand
      .setName("welcome")
      .setDescription("Set welcome channel")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel for welcome messages")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("morning")
      .setDescription("Set morning message channel and time")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel for morning messages")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("time")
          .setDescription("Time in HH:MM format (e.g. 09:00)")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("randomchat")
      .setDescription("Enable/disable random chat")
      .addBooleanOption((option) =>
        option
          .setName("enabled")
          .setDescription("Enable or disable random chat")
          .setRequired(true)
      )
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Channel for random chat")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(false)
      )
      .addIntegerOption((option) =>
        option
          .setName("frequency")
          .setDescription("Frequency in hours (default: 6)")
          .setMinValue(1)
          .setMaxValue(24)
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Show current bot configuration")
  );

const validateTimeFormat = (time: string): boolean => {
  const timeRegex = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
  return timeRegex.test(time);
};

const ensureGuildExists = async (guildId: string) => {
  const [existing] = await db
    .select()
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);

  if (!existing) {
    await db.insert(guilds).values({
      id: guildId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
};

const setupWelcome = async (interaction: ChatInputCommandInteraction) => {
  const channel = interaction.options.getChannel("channel", true);

  await ensureGuildExists(interaction.guildId!);

  await db
    .update(guilds)
    .set({
      welcomeChannelId: channel.id,
      updatedAt: new Date(),
    })
    .where(eq(guilds.id, interaction.guildId!));

  await interaction.reply({
    content: `✅ Welcome channel set to ${channel}`,
    ephemeral: true,
  });

  logger.info(
    `Welcome channel set for guild ${interaction.guildId}: ${channel.id}`
  );
};

const setupMorning = async (interaction: ChatInputCommandInteraction) => {
  const channel = interaction.options.getChannel("channel", true);
  const time = interaction.options.getString("time") || "09:00";

  if (!validateTimeFormat(time)) {
    await interaction.reply({
      content: "❌ Invalid time format. Use HH:MM (e.g. 09:00)",
      ephemeral: true,
    });
    return;
  }

  await ensureGuildExists(interaction.guildId!);

  await db
    .update(guilds)
    .set({
      morningMessageChannelId: channel.id,
      morningMessageTime: time,
      updatedAt: new Date(),
    })
    .where(eq(guilds.id, interaction.guildId!));

  await interaction.reply({
    content: `✅ Morning messages set to ${channel} at ${time}`,
    ephemeral: true,
  });

  logger.info(
    `Morning message configured for guild ${interaction.guildId}: ${channel.id} at ${time}`
  );
};

const setupRandomChat = async (interaction: ChatInputCommandInteraction) => {
  const enabled = interaction.options.getBoolean("enabled", true);
  const channel = interaction.options.getChannel("channel");
  const frequency = interaction.options.getInteger("frequency") || 6;

  await ensureGuildExists(interaction.guildId!);

  const updateData: any = {
    randomChatEnabled: enabled,
    randomChatFrequencyHours: frequency,
    updatedAt: new Date(),
  };

  if (channel) {
    updateData.randomChatChannels = [channel.id];
  }

  await db
    .update(guilds)
    .set(updateData)
    .where(eq(guilds.id, interaction.guildId!));

  const statusText = enabled ? "enabled" : "disabled";
  const channelText = channel ? ` in ${channel}` : "";
  const freqText = enabled ? ` (every ${frequency} hours)` : "";

  await interaction.reply({
    content: `✅ Random chat ${statusText}${channelText}${freqText}`,
    ephemeral: true,
  });

  logger.info(
    `Random chat ${statusText} for guild ${interaction.guildId}${channelText}`
  );
};

const showStatus = async (interaction: ChatInputCommandInteraction) => {
  const [config] = await db
    .select()
    .from(guilds)
    .where(eq(guilds.id, interaction.guildId!))
    .limit(1);

  if (!config) {
    await interaction.reply({
      content: "❌ No configuration found. Please set up the bot first.",
      ephemeral: true,
    });
    return;
  }

  const welcomeChannel = config.welcomeChannelId
    ? `<#${config.welcomeChannelId}>`
    : "Not set";
  const morningChannel = config.morningMessageChannelId
    ? `<#${config.morningMessageChannelId}>`
    : "Not set";
  const morningTime = config.morningMessageTime || "09:00";
  const randomChatStatus = config.randomChatEnabled
    ? "✅ Enabled"
    : "❌ Disabled";
  const randomChatChannels =
    config.randomChatChannels && config.randomChatChannels.length > 0
      ? config.randomChatChannels.map((id) => `<#${id}>`).join(", ")
      : "Not set";

  await interaction.reply({
    embeds: [
      {
        title: "☕ Shee Bot Configuration",
        color: 0xe8c5a5,
        fields: [
          {
            name: "🎉 Welcome Channel",
            value: welcomeChannel,
            inline: false,
          },
          {
            name: "☀️ Morning Message",
            value: `Channel: ${morningChannel}\nTime: ${morningTime}`,
            inline: false,
          },
          {
            name: "💬 Random Chat",
            value: `Status: ${randomChatStatus}\nChannels: ${randomChatChannels}\nFrequency: Every ${config.randomChatFrequencyHours} hours`,
            inline: false,
          },
        ],
        footer: {
          text: "Use /setup <subcommand> to configure",
        },
        timestamp: new Date().toISOString(),
      },
    ],
    ephemeral: true,
  });
};

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case "welcome":
        await setupWelcome(interaction);
        break;
      case "morning":
        await setupMorning(interaction);
        break;
      case "randomchat":
        await setupRandomChat(interaction);
        break;
      case "status":
        await showStatus(interaction);
        break;
      default:
        await interaction.reply({
          content: "❌ Unknown subcommand",
          ephemeral: true,
        });
    }
  } catch (error) {
    logger.error("Error in setup command:", error);
    await interaction.reply({
      content: "❌ An error occurred while executing the command",
      ephemeral: true,
    });
  }
}
