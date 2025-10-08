import type { Interaction } from "discord.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "@/utils/logger";

const commandCache = new Map<string, any>();

const loadCommand = (commandName: string): any => {
  if (commandCache.has(commandName)) {
    return commandCache.get(commandName);
  }

  try {
    const commandsPath = join(__dirname, "..", "commands");
    const commandFile = `${commandName}.ts`;

    if (readdirSync(commandsPath).includes(commandFile)) {
      const command = require(join(commandsPath, commandFile));
      commandCache.set(commandName, command);
      return command;
    }
  } catch (error) {
    logger.error(`Failed to load command ${commandName}:`, error);
  }

  return null;
};

export async function execute(interaction: Interaction) {
  if (!interaction.isChatInputCommand()) return;

  const command = loadCommand(interaction.commandName);

  if (!command) {
    logger.warn(`Command not found: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
    logger.info(
      `Command executed: ${interaction.commandName} by ${interaction.user.tag}`
    );
  } catch (error) {
    logger.error(`Error executing command ${interaction.commandName}:`, error);

    const errorMessage = {
      content: "❌ There was an error executing this command",
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
}
