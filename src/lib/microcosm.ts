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
const CONCURRENCY = 5 // max parallel Constellation requests

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
// Concurrency helper
// ---------------------------------------------------------------------------

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}

// ---------------------------------------------------------------------------
// Constellation queries
// ---------------------------------------------------------------------------

/**
 * Diagnostic: query /links/all for a target to discover what link types
 * Constellation has indexed. Logs the result for debugging.
 */
async function diagnoseTarget(targetUri: string): Promise<void> {
  try {
    const params = new URLSearchParams({ target: targetUri })
    const url = `${CONSTELLATION_BASE}/links/all?${params}`
    const res = await fetch(url, { headers: HEADERS })
    const body = await res.text()
    logger.info('constellation: /links/all diagnostic', {
      target: targetUri,
      status: res.status,
      body: body.slice(0, 500),
    })
  } catch (e) {
    logger.warn('constellation: diagnostic failed', {
      target: targetUri,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

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
  let pagesQueried = 0
  let lastStatus: number | undefined

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      subject: targetUri,
      source: ENDORSE_SOURCE,
      limit: '100',
    })
    if (cursor) params.set('cursor', cursor)

    const url = `${CONSTELLATION_BASE}/xrpc/blue.microcosm.links.getDistinct?${params}`

    try {
      const res = await fetch(url, { headers: HEADERS })
      lastStatus = res.status
      pagesQueried++

      if (!res.ok) {
        if (res.status !== 404) {
          logger.warn('constellation: getDistinct failed', {
            subject: targetUri,
            status: res.status,
          })
        }
        break
      }

      const data = (await res.json()) as Record<string, unknown>
      const responseDids = data.dids as string[] | undefined
      if (responseDids) dids.push(...responseDids)

      if (!data.cursor) break
      cursor = data.cursor as string
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

// ---------------------------------------------------------------------------
// Caching layer — Redis with in-memory fallback
// ---------------------------------------------------------------------------

async function getCached(uri: string): Promise<BacklinkResult | null> {
  const key = `${CACHE_PREFIX}${uri}`

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

  const mem = memoryCache.get(uri)
  if (mem && Date.now() - mem.fetchedAt < CACHE_TTL_SECONDS * 1000) {
    return mem.data
  }

  return null
}

async function setCache(uri: string, result: BacklinkResult): Promise<void> {
  const key = `${CACHE_PREFIX}${uri}`

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
 * Get endorsement data for multiple URIs with concurrency control.
 * Uses cache where available; fetches from Constellation for misses.
 */
export async function getEndorsersForUris(
  uris: string[],
): Promise<Map<string, BacklinkResult>> {
  const results = new Map<string, BacklinkResult>()
  const normalized = uris.map((u) => normalizeStewardUri(u) ?? u)
  const unique = [...new Set(normalized)]

  await runWithConcurrency(unique, CONCURRENCY, async (uri) => {
    const result = await getEndorsersForUri(uri)
    results.set(uri, result)
    return result
  })

  return results
}

/**
 * Run a one-time diagnostic to check what Constellation has for known targets.
 * Call this once per scan to verify the API is reachable and has our data.
 */
export async function runDiagnostic(sampleUri: string): Promise<void> {
  await diagnoseTarget(sampleUri)
}
