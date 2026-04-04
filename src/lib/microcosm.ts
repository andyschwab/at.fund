import { getRedisClient } from '@/lib/auth/kv-store'
import { normalizeStewardUri } from '@/lib/steward-uri'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Endorsement collection via PDS listRecords
// ---------------------------------------------------------------------------
//
// Single-pass approach: for each candidate DID (e.g. follows), query their
// PDS for all fund.at.endorse records. This is O(DIDs), not O(DIDs × URIs).
// We use Slingshot's resolveMiniDoc to get PDS URLs, then listRecords
// directly from each PDS.
// ---------------------------------------------------------------------------

const SLINGSHOT_BASE = 'https://slingshot.microcosm.blue'
const CACHE_TTL_SECONDS = 15 * 60 // 15 minutes
const CACHE_KEY = 'endorse:networkmap'
const CONCURRENCY = 20

const HEADERS = { 'User-Agent': 'at.fund/1.0 (endorsement-scan)' }

// In-memory fallback when Redis is unavailable
const memoryCache = new Map<string, { data: unknown; fetchedAt: number }>()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Map of endorsed URI → Set of endorser DIDs (from the scanned set). */
export type EndorsementMap = Map<string, Set<string>>

export type EndorsementResult = {
  /** Network endorsement count (from checked DIDs). */
  networkEndorsementCount: number
  /** DIDs that endorsed this URI. */
  endorserDids: string[]
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
// PDS resolution via Slingshot
// ---------------------------------------------------------------------------

type MiniDoc = { did: string; pds: string }

/**
 * Resolve DID → PDS URL via Slingshot's resolveMiniDoc.
 * Returns null if resolution fails.
 */
async function resolvePds(did: string): Promise<string | null> {
  try {
    const params = new URLSearchParams({ identifier: did })
    const res = await fetch(
      `${SLINGSHOT_BASE}/xrpc/blue.microcosm.identity.resolveMiniDoc?${params}`,
      { headers: HEADERS },
    )
    if (!res.ok) return null
    const data = (await res.json()) as MiniDoc
    return data.pds || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Single-pass endorsement collection
// ---------------------------------------------------------------------------

type ListRecordsResponse = {
  records?: Array<{
    uri?: string
    value?: { uri?: string; [key: string]: unknown }
  }>
}

/**
 * Fetch all fund.at.endorse records for a single DID from its PDS.
 * Returns the endorsed URIs (normalized).
 */
async function fetchEndorsementsForDid(
  did: string,
  pdsUrl: string,
): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      repo: did,
      collection: 'fund.at.endorse',
      limit: '100',
    })
    const res = await fetch(
      `${pdsUrl}/xrpc/com.atproto.repo.listRecords?${params}`,
      { headers: HEADERS },
    )
    if (!res.ok) return []

    const data = (await res.json()) as ListRecordsResponse
    const uris: string[] = []
    for (const record of data.records ?? []) {
      const raw = record.value?.uri
      if (typeof raw === 'string' && raw.trim()) {
        const normalized = normalizeStewardUri(raw) ?? raw.trim()
        uris.push(normalized)
      }
    }
    return uris
  } catch {
    return []
  }
}

/**
 * Collect all endorsements from a set of candidate DIDs.
 *
 * Single-pass: resolves each DID's PDS, then fetches their fund.at.endorse
 * records. Returns a map of endorsed URI → Set of endorser DIDs.
 *
 * O(candidateDids) — one PDS resolve + one listRecords per DID.
 */
export async function collectNetworkEndorsements(
  candidateDids: string[],
): Promise<EndorsementMap> {
  const endorsementMap: EndorsementMap = new Map()
  let resolvedCount = 0
  let withRecords = 0

  await runWithConcurrency(candidateDids, CONCURRENCY, async (did) => {
    // Step 1: Resolve PDS URL via Slingshot
    const pdsUrl = await resolvePds(did)
    if (!pdsUrl) return
    resolvedCount++

    // Step 2: List all fund.at.endorse records
    const endorsedUris = await fetchEndorsementsForDid(did, pdsUrl)
    if (endorsedUris.length === 0) return
    withRecords++

    // Step 3: Aggregate into the map
    for (const uri of endorsedUris) {
      let dids = endorsementMap.get(uri)
      if (!dids) {
        dids = new Set()
        endorsementMap.set(uri, dids)
      }
      dids.add(did)
    }
  })

  logger.info('slingshot: endorsement collection complete', {
    candidateDids: candidateDids.length,
    pdsResolved: resolvedCount,
    withEndorsements: withRecords,
    uniqueEndorsedUris: endorsementMap.size,
    totalEndorsements: [...endorsementMap.values()].reduce((s, dids) => s + dids.size, 0),
  })

  return endorsementMap
}

// ---------------------------------------------------------------------------
// Caching layer
// ---------------------------------------------------------------------------

type CachedMap = Record<string, string[]>

function serializeMap(map: EndorsementMap): CachedMap {
  const out: CachedMap = {}
  for (const [uri, dids] of map) {
    out[uri] = [...dids]
  }
  return out
}

function deserializeMap(data: CachedMap): EndorsementMap {
  const map: EndorsementMap = new Map()
  for (const [uri, dids] of Object.entries(data)) {
    map.set(uri, new Set(dids))
  }
  return map
}

/** Lightweight fingerprint for cache keying. */
function hashDids(dids: string[]): string {
  if (dids.length === 0) return '0'
  const sorted = [...dids].sort()
  return `${dids.length}:${sorted[0]!.slice(-8)}:${sorted[sorted.length - 1]!.slice(-8)}`
}

export async function collectNetworkEndorsementsCached(
  candidateDids: string[],
): Promise<EndorsementMap> {
  const hash = hashDids(candidateDids)
  const key = `${CACHE_KEY}:${hash}`

  // Try Redis
  const redis = getRedisClient()
  if (redis) {
    try {
      const cached = await redis.get<CachedMap>(key)
      if (cached) {
        logger.info('slingshot: using cached endorsement map', { dids: candidateDids.length })
        return deserializeMap(cached)
      }
    } catch (e) {
      logger.warn('slingshot: redis get failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // Try in-memory
  const mem = memoryCache.get(key)
  if (mem && Date.now() - mem.fetchedAt < CACHE_TTL_SECONDS * 1000) {
    logger.info('slingshot: using memory-cached endorsement map', { dids: candidateDids.length })
    return deserializeMap(mem.data as CachedMap)
  }

  // Fetch fresh
  const map = await collectNetworkEndorsements(candidateDids)
  const serialized = serializeMap(map)

  // Cache in Redis
  if (redis) {
    try {
      await redis.set(key, serialized, { ex: CACHE_TTL_SECONDS })
    } catch (e) {
      logger.warn('slingshot: redis set failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // Cache in memory
  memoryCache.set(key, { data: serialized, fetchedAt: Date.now() })

  return map
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Look up endorsement counts for a specific URI from a pre-collected map.
 */
export function getCountsFromMap(
  map: EndorsementMap,
  uri: string,
): EndorsementResult {
  const normalized = normalizeStewardUri(uri) ?? uri
  const dids = map.get(normalized)
  return {
    networkEndorsementCount: dids?.size ?? 0,
    endorserDids: dids ? [...dids] : [],
  }
}
