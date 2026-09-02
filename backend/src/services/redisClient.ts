import { createClient, RedisClientType } from "redis";
import { logger } from "../utils/logger.js";

let client: RedisClientType | null = null;

export async function connectRedis(): Promise<RedisClientType> {
  if (client) return client;
  const rawUrl = process.env.REDIS_URL;
  if (!rawUrl && process.env.NODE_ENV === "production") {
    throw new Error("REDIS_URL is required in production");
  }
  const url = rawUrl || "redis://localhost:6379";
  client = createClient({ url });


  client.on("error", (err) => {
    logger.error("Redis client error", { error: err });
  });

  client.on("connect", () => logger.info("Redis client connecting"));
  client.on("ready", () => logger.info("Redis client ready"));
  client.on("end", () => logger.info("Redis client disconnected"));

  await client.connect();
  return client;
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch (err) {
    logger.warn("Error quitting Redis client", { error: err });
  }
  client = null;
}

export function getRedisClient(): RedisClientType | null {
  return client;
}

export async function redisHealthCheck(): Promise<boolean> {
  try {
    const c = await connectRedis();
    const pong = await c.ping();
    return pong === "PONG";
  } catch (err) {
    logger.error("Redis healthcheck failed", { error: err });
    return false;
  }
}
