import { redis, ensureRedisConnected, isRedisReady } from "./redis";

const DEFAULT_TTL = 3600; // 1 hour in seconds
const DESCRIPTOR_TTL = 7200; // 2 hours (descriptors change rarely)

/**
 * Generic cache get with JSON deserialization.
 * Returns null if Redis unavailable or key not found.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!isRedisReady()) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Generic cache set with JSON serialization and TTL.
 * Silently fails if Redis unavailable.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // Non-critical — proceed without cache
  }
}

/**
 * Delete a cache key. Silently fails if Redis unavailable.
 */
export async function cacheDel(key: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    await redis.del(key);
  } catch {
    // Non-critical
  }
}

/**
 * Delete all keys matching a pattern. Use sparingly.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  if (!isRedisReady()) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch {
    // Non-critical
  }
}

// ─── Domain-specific cache functions ─────────────────────────────

interface CachedDescriptor {
  id: string;
  code: string;
  description: string;
  evaluationId: string;
  subjectId: string;
  gradeLevelId: string;
}

/**
 * Cache descriptors by evaluation+subject+gradeLevel combo.
 * Key: descriptors:{evaluationSlug}:{subjectSlug}:{gradeLevelSlug}
 */
export async function getCachedDescriptors(
  evaluationSlug: string,
  subjectSlug: string,
  gradeLevelSlug: string,
): Promise<CachedDescriptor[] | null> {
  const key = `descriptors:${evaluationSlug}:${subjectSlug}:${gradeLevelSlug}`;
  return cacheGet<CachedDescriptor[]>(key);
}

export async function setCachedDescriptors(
  evaluationSlug: string,
  subjectSlug: string,
  gradeLevelSlug: string,
  descriptors: CachedDescriptor[],
): Promise<void> {
  const key = `descriptors:${evaluationSlug}:${subjectSlug}:${gradeLevelSlug}`;
  await cacheSet(key, descriptors, DESCRIPTOR_TTL);
}

/**
 * Cache entity lookups by slug (evaluation, subject, gradeLevel).
 * Key: entity:{type}:{slug}
 */
export async function getCachedEntity<T>(type: string, slug: string): Promise<T | null> {
  return cacheGet<T>(`entity:${type}:${slug}`);
}

export async function setCachedEntity(type: string, slug: string, data: unknown): Promise<void> {
  await cacheSet(`entity:${type}:${slug}`, data, DESCRIPTOR_TTL);
}

/**
 * Invalidate all descriptor caches (call after seeding or updating descriptors).
 */
export async function invalidateDescriptorCache(): Promise<void> {
  await cacheDelPattern("descriptors:*");
  await cacheDelPattern("entity:*");
}

/**
 * Initialize cache connection. Call early in app lifecycle.
 */
export async function initCache(): Promise<boolean> {
  return ensureRedisConnected();
}

export { isRedisReady } from "./redis";
