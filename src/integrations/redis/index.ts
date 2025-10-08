import { cfg } from "@/utils/config";
import { createClient } from "redis";

const createRedisClient = () =>
  createClient({
    username: cfg.REDIS_USERNAME,
    password: cfg.REDIS_PASSWORD,
    socket: {
      host: cfg.REDIS_HOST,
      port: cfg.REDIS_PORT,
    },
  });

const handleRedisError = (err: Error) => {
  console.log("Redis Client Error", err);
};

const handleConnectionError = (err: Error) => {
  console.error("Failed to connect to Redis:", err);
};

export const redis = createRedisClient();

redis.on("error", handleRedisError);
redis.connect().catch(handleConnectionError);
