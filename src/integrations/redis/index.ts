import { cfg } from "@/utils/config";
import { createClient } from "redis";

const client = createClient({
  username: cfg.REDIS_USERNAME,
  password: cfg.REDIS_PASSWORD,
  socket: {
    host: cfg.REDIS_HOST,
    port: cfg.REDIS_PORT,
  },
});

client.on("error", (err) => console.log("Redis Client Error", err));

// Connect to Redis asynchronously
client
  .connect()
  .catch((err) => console.error("Failed to connect to Redis:", err));

export const redis = client;
