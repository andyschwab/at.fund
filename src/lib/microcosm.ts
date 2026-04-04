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

// The "source" param combines collection NSID and json-path to the link field.
// For fund.at.endorse records, the endorsed URI lives at the `.uri` field.
const ENDORSE_SOURCE = 'fund.at.endorse:uri'

const HEADERS = { 'User-Agent': 'at.fund/1.0 (endorsement-index)' }

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

// ---------------------------------------------------------------------------
// Constellation queries
// ---------------------------------------------------------------------------

/**
 * Fetch distinct endorser DIDs for a target URI from Constellation.
 * Uses the getDistinct endpoint which returns just DIDs — perfect for
 * intersecting with the user's follow set.
 */
async function fetchEndorserDids(
  targetUri: string,
): Promise<BacklinkResult> {
  const dids: string[] = []
  let cursor: string | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      subject: targetUri,
      source: ENDORSE_SOURCE,
      limit: '100',
    })
    if (cursor) params.set('cursor', cursor)

    try {
      const res = await fetch(
        `${CONSTELLATION_BASE}/xrpc/blue.microcosm.links.getDistinct?${params}`,
        { headers: HEADERS },
      )
      if (!res.ok) {
        logger.warn('constellation: getDistinct failed', {
          subject: targetUri,
          status: res.status,
        })
        break
      }

      const data = (await res.json()) as { dids?: string[]; cursor?: string | null }
      if (data.dids) dids.push(...data.dids)

      if (!data.cursor) break
      cursor = data.cursor
    } catch (e) {
      logger.warn('constellation: fetch error', {
        subject: targetUri,
        error: e instanceof Error ? e.message : String(e),
      })
      break
    }
  }

  return { endorserDids: dids, totalCount: dids.length }
}

/**
 * Fast count-only query via getBacklinksCount.
 */
async function fetchCount(
  targetUri: string,
): Promise<number> {
  try {
    const params = new URLSearchParams({
      subject: targetUri,
      source: ENDORSE_SOURCE,
    })
    const res = await fetch(
      `${CONSTELLATION_BASE}/xrpc/blue.microcosm.links.getBacklinksCount?${params}`,
      { headers: HEADERS },
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

  const result = await fetchEndorserDids(normalized)
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
  const count = await fetchCount(normalized)
  if (count >= 0) return count

  // Fall back to full fetch (also caches it)
  const result = await getEndorsersForUri(normalized)
  return result.totalCount
}
