import { Client, GatewayIntentBits, Partials } from "discord.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./utils/logger";

const createDiscordClient = () =>
  new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });

const getEventFiles = (eventsPath: string): string[] =>
  readdirSync(eventsPath).filter(
    (file) => file.endsWith(".ts") || file.endsWith(".js")
  );

const extractEventName = (filename: string): string => filename.split(".")[0];

export class SheeBot {
  public readonly client: Client;

  constructor() {
    this.client = createDiscordClient();
    this.loadEventHandlers();
  }

  private loadEventHandlers(): void {
    const eventsPath = join(__dirname, "events");
    const eventFiles = getEventFiles(eventsPath);

    for (const file of eventFiles) {
      const event = require(join(eventsPath, file));
      const eventName = extractEventName(file);

      this.registerEvent(eventName, event);
      logger.info(`✅ Loaded event: ${eventName}`);
    }
  }

  private registerEvent(eventName: string, event: any): void {
    if (event.once) {
      this.client.once(eventName, (...args) => event.execute(...args));
    } else {
      this.client.on(eventName, (...args) => event.execute(...args));
    }
  }

  async start(token: string): Promise<void> {
    try {
      await this.client.login(token);
    } catch (error) {
      logger.error("Failed to start bot:", error);
      process.exit(1);
    }
  }

  async shutdown(): Promise<void> {
    logger.info("Shutting down Shee bot...");
    this.client.destroy();
    process.exit(0);
  }
}

const handleShutdownSignal = (signal: string) => {
  logger.info(`Received ${signal} signal`);
  process.exit(0);
};

process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
