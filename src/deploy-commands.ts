import { REST, Routes } from "discord.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { cfg } from "./utils/config";

const loadCommands = () => {
  const commands = [];
  const commandsPath = join(__dirname, "commands");
  const commandFiles = readdirSync(commandsPath).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js")
  );

  for (const file of commandFiles) {
    const command = require(join(commandsPath, file));
    if ("data" in command && "execute" in command) {
      commands.push(command.data.toJSON());
      console.log(`✅ Loaded command: ${command.data.name}`);
    } else {
      console.log(`⚠️  Skipped ${file}: missing data or execute`);
    }
  }

  return commands;
};

const deployCommands = async () => {
  try {
    const commands = loadCommands();
    const rest = new REST({ version: "10" }).setToken(cfg.DISCORD_TOKEN);

    console.log(`🚀 Deploying ${commands.length} commands...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(
        cfg.DISCORD_CLIENT_ID,
        cfg.DISCORD_GUILD_ID
      ),
      { body: commands }
    );

    console.log(`✅ Successfully deployed ${(data as any).length} commands`);
  } catch (error) {
    console.error("❌ Failed to deploy commands:", error);
    process.exit(1);
  }
};

console.log("🔄 Starting command deployment...");
console.log(cfg);
deployCommands();
