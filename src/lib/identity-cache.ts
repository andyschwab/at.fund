/**
 * Two-tier identity cache for stable ATProto resolution data.
 *
 * L1: in-process Map with TTL — instant, scoped to warm Vercel instance.
 * L2: Upstash Redis with TTL — shared across all instances, survives cold starts.
 *
 * Read path:  L1 hit → return | L1 miss → L2 hit → backfill L1, return | both miss → caller fetches, writes both.
 * Write path: populate L1 immediately, fire-and-forget Redis SET (non-blocking).
 *
 * Namespaces:
 *   handleToDid   — handle → DID (7-day TTL)
 *   didToDoc      — DID → DID document JSON (7-day TTL)
 *   hostnameToDid — hostname → DID | null (7-day TTL)
 *   didToPds      — DID → PDS URL string | null (7-day TTL)
 */

import { getRedisClient } from '@/lib/auth/kv-store'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// TTL configuration
// ---------------------------------------------------------------------------

const REDIS_TTL_SECONDS = 7 * 24 * 60 * 60 // 7 days
const L1_TTL_MS = 30 * 60 * 1000 // 30 min (warm-instance ceiling)

// ---------------------------------------------------------------------------
// L1: in-process TTL Map
// ---------------------------------------------------------------------------

type L1Entry<T> = { value: T; expiresAt: number }

class L1Cache<T> {
  private store = new Map<string, L1Entry<T>>()

  get(key: string): T | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (e.expiresAt <= Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return e.value
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + L1_TTL_MS })
  }

  delete(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

// ---------------------------------------------------------------------------
// Namespace → Redis key prefix mapping
// ---------------------------------------------------------------------------

const NAMESPACES = {
  handleToDid: 'id:h2d',
  didToDoc: 'id:d2doc',
  hostnameToDid: 'id:hn2d',
  didToPds: 'id:d2pds',
} as const

type Namespace = keyof typeof NAMESPACES

// ---------------------------------------------------------------------------
// Global-backed L1 instances (survive HMR in dev)
// ---------------------------------------------------------------------------

const g = global as typeof globalThis & {
  __identityL1?: Partial<Record<Namespace, L1Cache<unknown>>>
}
const l1Caches = (g.__identityL1 ??= {})

function getL1<T>(ns: Namespace): L1Cache<T> {
  return (l1Caches[ns] ??= new L1Cache()) as L1Cache<T>
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read from the two-tier cache. Returns undefined on miss.
 * L1 is checked first (instant); on L1 miss, L2 (Redis) is checked and
 * the result is backfilled into L1.
 */
export async function identityGet<T>(
  ns: Namespace,
  key: string,
): Promise<T | undefined> {
  // L1
  const l1 = getL1<T>(ns)
  const l1Hit = l1.get(key)
  if (l1Hit !== undefined) return l1Hit

  // L2
  const redis = getRedisClient()
  if (redis) {
    try {
      const val = await redis.get<T>(`${NAMESPACES[ns]}:${key}`)
      if (val !== undefined && val !== null) {
        l1.set(key, val) // backfill L1
        return val
      }
    } catch (e) {
      logger.warn('identity-cache: redis get failed', {
        ns,
        key,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return undefined
}

/**
 * Write to both tiers. L1 is populated synchronously; Redis SET is
 * fire-and-forget (non-blocking) since L1 already has the value for
 * subsequent reads in the same instance.
 */
export function identitySet<T>(ns: Namespace, key: string, value: T): void {
  // L1 — synchronous
  getL1<T>(ns).set(key, value)

  // L2 — fire-and-forget
  const redis = getRedisClient()
  if (redis) {
    redis.set(`${NAMESPACES[ns]}:${key}`, value, { ex: REDIS_TTL_SECONDS }).catch((e) => {
      logger.warn('identity-cache: redis set failed', {
        ns,
        key,
        error: e instanceof Error ? e.message : String(e),
      })
    })
  }
}

/**
 * Clear all identity caches (both tiers). Useful for tests.
 */
export function clearIdentityCache(): void {
  for (const ns of Object.keys(NAMESPACES) as Namespace[]) {
    getL1(ns).clear()
  }
  // Redis entries are not bulk-deleted — they'll expire naturally via TTL.
  // For forced invalidation, use identityDelete() per key.
}

/**
 * Remove a single key from both tiers.
 */
export function identityDelete(ns: Namespace, key: string): void {
  getL1(ns).delete(key)

  const redis = getRedisClient()
  if (redis) {
    redis.del(`${NAMESPACES[ns]}:${key}`).catch((e) => {
      logger.warn('identity-cache: redis del failed', {
        ns,
        key,
        error: e instanceof Error ? e.message : String(e),
      })
    })
  }
}
