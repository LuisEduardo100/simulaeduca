import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

function createRedisClient(): Redis {
  const client = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 10) return null; // Stop retrying after 10 attempts
      return Math.min(times * 200, 5000); // Exponential backoff, max 5s
    },
    reconnectOnError(err) {
      const targetErrors = ["READONLY", "ECONNRESET", "EPIPE"];
      return targetErrors.some((e) => err.message.includes(e));
    },
    lazyConnect: true,
  });

  client.on("error", (err) => {
    console.error("[Redis] Connection error:", err.message);
  });

  client.on("connect", () => {
    console.log("[Redis] Connected");
  });

  return client;
}

// Singleton pattern — reuse across hot reloads in dev
const globalForRedis = globalThis as unknown as {
  __redis?: Redis;
  __redisSub?: Redis;
};

/** Main Redis client for commands, caching, and BullMQ */
export const redis: Redis =
  globalForRedis.__redis ?? (globalForRedis.__redis = createRedisClient());

/** Dedicated subscriber client (Redis requires separate connection for pub/sub) */
export const redisSub: Redis =
  globalForRedis.__redisSub ?? (globalForRedis.__redisSub = createRedisClient());

/** Ensure Redis is connected. Safe to call multiple times. */
export async function ensureRedisConnected(): Promise<boolean> {
  try {
    if (redis.status === "ready") return true;
    if (redis.status === "connecting") {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Redis connect timeout")), 5000);
        redis.once("ready", () => { clearTimeout(timeout); resolve(); });
        redis.once("error", (err) => { clearTimeout(timeout); reject(err); });
      });
      return true;
    }
    await redis.connect();
    return true;
  } catch {
    console.warn("[Redis] Could not connect, operating without cache");
    return false;
  }
}

/** Check if Redis is available (non-blocking) */
export function isRedisReady(): boolean {
  return redis.status === "ready";
}
