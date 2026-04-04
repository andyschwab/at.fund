/**
 * Upstash Redis-backed persistent store for analytics data.
 *
 * Stores Microcosm records and computed graph data with TTLs so we
 * only pull incremental updates rather than full record sets on every request.
 */

import { Redis } from '@upstash/redis'
import { logger } from '@/lib/logger'
import type { UfosRecord } from '@/lib/microcosm'

// ---------------------------------------------------------------------------
// Redis singleton (reuses env-var pattern from kv-store.ts)
// ---------------------------------------------------------------------------

let _redis: Redis | null = null

function getRedis(): Redis | null {
  if (_redis) return _redis
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.UPSTASH_KV_REST_API_URL ??
    process.env.KV_REST_API_URL
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.UPSTASH_KV_REST_API_TOKEN ??
    process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    logger.warn('analytics-store: no Redis credentials — using in-memory fallback')
    return null
  }
  _redis = new Redis({ url, token })
  return _redis
}

// ---------------------------------------------------------------------------
// TTL configuration (seconds)
// ---------------------------------------------------------------------------

const TTL = {
  graph: 15 * 60,          // 15 minutes — computed graph
  records: 60 * 60,        // 1 hour — raw UFOs records
  endorsements: 30 * 60,   // 30 minutes — Constellation counts
  cursor: 7 * 24 * 60 * 60, // 7 days — pagination cursors persist longer
} as const

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

const KEY = {
  graph: 'analytics:graph',
  records: (nsid: string) => `analytics:records:${nsid}`,
  cursor: (nsid: string) => `analytics:cursor:${nsid}`,
  endorsements: (uri: string) => `analytics:endorsements:${uri}`,
} as const

// ---------------------------------------------------------------------------
// In-memory fallback when Redis is unavailable
// ---------------------------------------------------------------------------

type MemEntry = { value: unknown; expiresAt: number }
const memStore = new Map<string, MemEntry>()

function memGet<T>(key: string): T | null {
  const entry = memStore.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memStore.delete(key)
    return null
  }
  return entry.value as T
}

function memSet(key: string, value: unknown, ttlSeconds: number): void {
  memStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

// ---------------------------------------------------------------------------
// Generic get/set with fallback
// ---------------------------------------------------------------------------

async function storeGet<T>(key: string): Promise<T | null> {
  const redis = getRedis()
  if (!redis) return memGet<T>(key)
  try {
    const val = await redis.get<T>(key)
    return val ?? null
  } catch (e) {
    logger.warn('analytics-store: Redis get failed, using memory', {
      key,
      error: e instanceof Error ? e.message : String(e),
    })
    return memGet<T>(key)
  }
}

async function storeSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  memSet(key, value, ttlSeconds)
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(key, value, { ex: ttlSeconds })
  } catch (e) {
    logger.warn('analytics-store: Redis set failed', {
      key,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

// ---------------------------------------------------------------------------
// Graph cache
// ---------------------------------------------------------------------------

export type StoredGraph = {
  nodes: unknown[]
  edges: unknown[]
  stats: unknown
  updatedAt: string
}

export async function getCachedGraph(): Promise<StoredGraph | null> {
  return storeGet<StoredGraph>(KEY.graph)
}

export async function setCachedGraph(graph: StoredGraph): Promise<void> {
  await storeSet(KEY.graph, graph, TTL.graph)
}

// ---------------------------------------------------------------------------
// UFOs record cache
// ---------------------------------------------------------------------------

export async function getCachedRecords(nsid: string): Promise<UfosRecord[] | null> {
  return storeGet<UfosRecord[]>(KEY.records(nsid))
}

export async function setCachedRecords(nsid: string, records: UfosRecord[]): Promise<void> {
  await storeSet(KEY.records(nsid), records, TTL.records)
}

// ---------------------------------------------------------------------------
// Pagination cursors
// ---------------------------------------------------------------------------

export async function getCursor(nsid: string): Promise<string | null> {
  return storeGet<string>(KEY.cursor(nsid))
}

export async function setCursor(nsid: string, cursor: string): Promise<void> {
  await storeSet(KEY.cursor(nsid), cursor, TTL.cursor)
}

// ---------------------------------------------------------------------------
// Endorsement counts
// ---------------------------------------------------------------------------

export async function getCachedEndorsements(uri: string): Promise<number | null> {
  return storeGet<number>(KEY.endorsements(uri))
}

export async function setCachedEndorsements(uri: string, count: number): Promise<void> {
  await storeSet(KEY.endorsements(uri), count, TTL.endorsements)
}
