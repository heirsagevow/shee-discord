import { redis } from "@/integrations/redis";
import { logger } from "./logger";

export const cache = {
  async get(key: string): Promise<string | null> {
    if (!redis) return null;
    try {
      return await redis.get(key);
    } catch (error) {
      logger.error("Redis GET error:", error);
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
      logger.error("Redis SET error:", error);
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    if (!redis) return false;
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      logger.error("Redis DEL error:", error);
      return false;
    }
  },

  async increment(key: string, ttlSeconds?: number): Promise<number> {
    if (!redis) return 0;
    try {
      const count = await redis.incr(key);
      if (ttlSeconds && count === 1) {
        await redis.expire(key, ttlSeconds);
      }
      return count;
    } catch (error) {
      logger.error("Redis INCR error:", error);
      return 0;
    }
  },
};
