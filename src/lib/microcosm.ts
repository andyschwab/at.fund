import { getRedisClient } from '@/lib/auth/kv-store'
import { normalizeStewardUri } from '@/lib/steward-uri'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Constellation API — complete backlink index for AT Protocol
// ---------------------------------------------------------------------------

const CONSTELLATION_BASE = 'https://constellation.microcosm.blue'
const CACHE_TTL_SECONDS = 15 * 60 // 15 minutes
const CACHE_PREFIX = 'endorse:backlinks:'
const MAX_PAGES = 20 // safety limit to avoid runaway pagination

// In-memory fallback when Redis is unavailable (local dev)
const memoryCache = new Map<string, { data: BacklinkResult; fetchedAt: number }>()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BacklinkResult = {
  /** DIDs of accounts that endorsed this URI. */
  endorserDids: string[]
  /** Total endorsement count. */
  totalCount: number
}

type ConstellationLink = {
  uri?: string
  author?: string
  cid?: string
  timestamp?: string
}

type ConstellationResponse = {
  links?: ConstellationLink[]
  cursor?: string | null
}

// ---------------------------------------------------------------------------
// Constellation queries
// ---------------------------------------------------------------------------

/**
 * Fetch all endorser DIDs for a target URI from Constellation.
 * Paginates to get the complete set.
 */
async function fetchBacklinksFromConstellation(
  targetUri: string,
): Promise<BacklinkResult> {
  const dids = new Set<string>()
  let cursor: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({ target: targetUri })
    if (cursor) params.set('cursor', cursor)

    try {
      const res = await fetch(
        `${CONSTELLATION_BASE}/xrpc/blue.microcosm.links.getBacklinks?${params}`,
        { headers: { 'User-Agent': 'at.fund/1.0 (endorsement-index)' } },
      )
      if (!res.ok) {
        logger.warn('constellation: backlinks request failed', {
          target: targetUri,
          status: res.status,
        })
        break
      }

      const data = (await res.json()) as ConstellationResponse
      for (const link of data.links ?? []) {
        if (link.author) dids.add(link.author)
      }

      if (!data.cursor) break
      cursor = data.cursor
    } catch (e) {
      logger.warn('constellation: fetch error', {
        target: targetUri,
        error: e instanceof Error ? e.message : String(e),
      })
      break
    }
  }

  return { endorserDids: [...dids], totalCount: dids.size }
}

/**
 * Fast count-only query. Falls back to full fetch if endpoint unavailable.
 */
async function fetchCountFromConstellation(
  targetUri: string,
): Promise<number> {
  try {
    const params = new URLSearchParams({
      target: targetUri,
      collection: 'fund.at.endorse',
      path: '.uri',
    })
    const res = await fetch(
      `${CONSTELLATION_BASE}/links/count?${params}`,
      { headers: { 'User-Agent': 'at.fund/1.0 (endorsement-index)' } },
    )
    if (res.ok) {
      const data = (await res.json()) as { count?: number }
      if (typeof data.count === 'number') return data.count
    }
  } catch { /* fall through */ }
  return -1 // signals caller to use full fetch
}

// ---------------------------------------------------------------------------
// Caching layer — Redis with in-memory fallback
// ---------------------------------------------------------------------------

async function getCached(uri: string): Promise<BacklinkResult | null> {
  const key = `${CACHE_PREFIX}${uri}`

  // Try Redis first
  const redis = getRedisClient()
  if (redis) {
    try {
      const cached = await redis.get<BacklinkResult>(key)
      if (cached) return cached
    } catch (e) {
      logger.warn('constellation: redis get failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // In-memory fallback
  const mem = memoryCache.get(uri)
  if (mem && Date.now() - mem.fetchedAt < CACHE_TTL_SECONDS * 1000) {
    return mem.data
  }

  return null
}

async function setCache(uri: string, result: BacklinkResult): Promise<void> {
  const key = `${CACHE_PREFIX}${uri}`

  // Redis
  const redis = getRedisClient()
  if (redis) {
    try {
      await redis.set(key, result, { ex: CACHE_TTL_SECONDS })
    } catch (e) {
      logger.warn('constellation: redis set failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // Always update in-memory too
  memoryCache.set(uri, { data: result, fetchedAt: Date.now() })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get endorsement data for a single URI. Returns cached result if available,
 * otherwise queries Constellation and caches the response.
 */
export async function getEndorsersForUri(
  uri: string,
): Promise<BacklinkResult> {
  const normalized = normalizeStewardUri(uri) ?? uri
  const cached = await getCached(normalized)
  if (cached) return cached

  const result = await fetchBacklinksFromConstellation(normalized)
  await setCache(normalized, result)
  return result
}

/**
 * Get endorsement data for multiple URIs in parallel.
 * Uses cache where available; fetches from Constellation for misses.
 */
export async function getEndorsersForUris(
  uris: string[],
): Promise<Map<string, BacklinkResult>> {
  const results = new Map<string, BacklinkResult>()
  const normalized = uris.map((u) => normalizeStewardUri(u) ?? u)
  const unique = [...new Set(normalized)]

  await Promise.all(
    unique.map(async (uri) => {
      const result = await getEndorsersForUri(uri)
      results.set(uri, result)
    }),
  )

  return results
}

/**
 * Fast count-only query for a URI. Uses cache if available (extracts count
 * from cached backlink data), otherwise queries Constellation's count endpoint.
 */
export async function getEndorsementCountForUri(
  uri: string,
): Promise<number> {
  const normalized = normalizeStewardUri(uri) ?? uri

  // Check cache first
  const cached = await getCached(normalized)
  if (cached) return cached.totalCount

  // Try fast count endpoint
  const count = await fetchCountFromConstellation(normalized)
  if (count >= 0) return count

  // Fall back to full fetch (also caches it)
  const result = await getEndorsersForUri(normalized)
  return result.totalCount
}
