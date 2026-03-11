import { redis, isRedisReady } from "./redis";

interface RateLimitConfig {
  /** Max requests allowed in the window */
  max: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Predefined rate limit tiers for different API endpoints.
 */
export const RATE_LIMITS = {
  /** Generation: max 5 per minute per user */
  generation: { max: 5, windowSeconds: 60 } as RateLimitConfig,
  /** PDF download: max 20 per minute per user */
  pdf: { max: 20, windowSeconds: 60 } as RateLimitConfig,
  /** Scraping: max 10 per minute per admin */
  scraping: { max: 10, windowSeconds: 60 } as RateLimitConfig,
  /** Extract questions: max 15 per minute per admin */
  extraction: { max: 15, windowSeconds: 60 } as RateLimitConfig,
  /** General API: max 60 per minute per user */
  general: { max: 60, windowSeconds: 60 } as RateLimitConfig,
  /** Descriptors: max 30 per minute per user (mostly cached) */
  descriptors: { max: 30, windowSeconds: 60 } as RateLimitConfig,
} as const;

/**
 * Check rate limit using Redis sliding window counter.
 * Uses INCR + EXPIRE for simplicity and atomicity.
 *
 * Returns { allowed: true } if Redis is unavailable (fail-open).
 */
export async function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (!isRedisReady()) {
    // Fail open — allow requests when Redis is down
    return { allowed: true, remaining: config.max, resetInSeconds: 0 };
  }

  const key = `rl:${endpoint}:${identifier}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.ttl(key);
    const results = await pipeline.exec();

    if (!results) {
      return { allowed: true, remaining: config.max, resetInSeconds: 0 };
    }

    const count = results[0][1] as number;
    const ttl = results[1][1] as number;

    // Set expiry on first request in window
    if (count === 1 || ttl === -1) {
      await redis.expire(key, config.windowSeconds);
    }

    const remaining = Math.max(0, config.max - count);
    const resetInSeconds = ttl > 0 ? ttl : config.windowSeconds;

    return {
      allowed: count <= config.max,
      remaining,
      resetInSeconds,
    };
  } catch {
    // Fail open on error
    return { allowed: true, remaining: config.max, resetInSeconds: 0 };
  }
}

/**
 * Convenience: check rate limit and return 429 response if exceeded.
 * Returns null if allowed, or a NextResponse if rate limited.
 */
export async function rateLimitOrNull(
  userId: string,
  endpoint: keyof typeof RATE_LIMITS
): Promise<{ error: string; status: 429; headers: Record<string, string> } | null> {
  const config = RATE_LIMITS[endpoint];
  const result = await checkRateLimit(userId, endpoint, config);

  if (!result.allowed) {
    return {
      error: `Limite de requisições excedido. Tente novamente em ${result.resetInSeconds}s.`,
      status: 429,
      headers: {
        "Retry-After": String(result.resetInSeconds),
        "X-RateLimit-Limit": String(config.max),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(result.resetInSeconds),
      },
    };
  }

  return null;
}
