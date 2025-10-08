import { redis } from "@/integrations/redis";
import { logger } from "./logger";

const handleRedisError = (operation: string, error: unknown): void => {
  logger.error(`Redis ${operation} error:`, error);
};

export const cache = {
  async get(key: string): Promise<string | null> {
    if (!redis) return null;
    try {
      return await redis.get(key);
    } catch (error) {
      handleRedisError("GET", error);
      return null;
    }
  },

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!redis) return false;
    try {
      if (ttlSeconds) {
        await redis.setex(key, ttlSeconds, value);
      } else {
        await redis.set(key, value);
      }
      return true;
    } catch (error) {
      handleRedisError("SET", error);
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    if (!redis) return false;
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      handleRedisError("DEL", error);
      return false;
    }
  },

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    if (!redis) return 0;
    try {
      const count = await redis.incr(key);
      const isFirstIncrement = count === 1;

      if (ttlSeconds && isFirstIncrement) {
        await redis.expire(key, ttlSeconds);
      }
      return count;
    } catch (error) {
      handleRedisError("INCR", error);
      return 0;
    }
  },
};
