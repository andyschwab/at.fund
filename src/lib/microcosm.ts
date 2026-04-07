import { getRedisClient } from '@/lib/auth/kv-store'
import { normalizeStewardUri } from '@/lib/steward-uri'
import { resolveRefToDid } from '@/lib/identity'
import { FUND_ENDORSE, LEGACY_ENDORSE } from '@/lib/fund-at-records'
import { logger } from '@/lib/logger'
import { runWithConcurrency } from '@/lib/concurrency'

// ---------------------------------------------------------------------------
// Endorsement collection via PDS listRecords
// ---------------------------------------------------------------------------
//
// Single-pass approach: for each candidate DID (e.g. follows), query their
// PDS for all fund.at.graph.endorse records. This is O(DIDs), not O(DIDs × URIs).
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

/** Map of endorsed DID → Set of endorser DIDs (from the scanned set). */
export type EndorsementMap = Map<string, Set<string>>

/** Endorsement count for a single URI, derived from the endorsement map. */
export type EndorsementCounts = {
  networkEndorsementCount: number
}

/** Singleflight cache for resolving non-DID URIs to DIDs during collection. */
type DidResolutionCache = Map<string, Promise<string | undefined>>

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
    value?: { subject?: string; uri?: string; [key: string]: unknown }
  }>
}

/**
 * Resolve a non-DID URI to a DID, using the shared singleflight cache.
 * Returns undefined if resolution fails.
 */
function cachedResolve(
  uri: string,
  cache: DidResolutionCache,
): Promise<string | undefined> {
  const existing = cache.get(uri)
  if (existing) return existing
  const promise = resolveRefToDid(uri)
  cache.set(uri, promise)
  return promise
}

/**
 * Fetch all fund.at.graph.endorse records for a single DID from its PDS.
 * Falls back to legacy fund.at.endorse collection.
 *
 * Two-stage resolution: DIDs pass through immediately; handles and hostnames
 * are resolved to DIDs via the shared singleflight cache so duplicate URIs
 * across follows only trigger one network call.
 *
 * Returns endorsed DIDs (non-DID URIs that can't resolve are dropped).
 */
async function fetchEndorsementsForDid(
  did: string,
  pdsUrl: string,
  didCache: DidResolutionCache,
): Promise<string[]> {
  // Try new NSID first, fall back to legacy
  for (const collection of [FUND_ENDORSE, LEGACY_ENDORSE]) {
    try {
      const params = new URLSearchParams({
        repo: did,
        collection,
        limit: '100',
      })
      const res = await fetch(
        `${pdsUrl}/xrpc/com.atproto.repo.listRecords?${params}`,
        { headers: HEADERS },
      )
      if (!res.ok) continue

      const data = (await res.json()) as ListRecordsResponse

      // Stage 1: partition into DIDs and non-DIDs
      const dids: string[] = []
      const pendingResolves: Promise<string | undefined>[] = []
      for (const record of data.records ?? []) {
        const raw = record.value?.subject ?? record.value?.uri
        if (typeof raw !== 'string' || !raw.trim()) continue
        const normalized = normalizeStewardUri(raw) ?? raw.trim()
        if (normalized.startsWith('did:')) {
          dids.push(normalized)
        } else {
          pendingResolves.push(cachedResolve(normalized, didCache))
        }
      }

      // Stage 2: resolve non-DIDs (singleflight — shared across all follows)
      if (pendingResolves.length > 0) {
        const resolved = await Promise.all(pendingResolves)
        for (const did of resolved) {
          if (did) dids.push(did)
        }
      }

      if (dids.length > 0) return dids
    } catch {
      continue
    }
  }
  return []
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
  onProgress?: (scanned: number, total: number) => void,
): Promise<EndorsementMap> {
  const endorsementMap: EndorsementMap = new Map()
  // Shared singleflight cache: non-DID URIs resolved once across all follows
  const didCache: DidResolutionCache = new Map()
  let resolvedCount = 0
  let withRecords = 0
  let scannedCount = 0

  await runWithConcurrency(candidateDids, CONCURRENCY, async (did) => {
    // Step 1: Resolve PDS URL via Slingshot
    const pdsUrl = await resolvePds(did)
    if (!pdsUrl) { scannedCount++; onProgress?.(scannedCount, candidateDids.length); return }
    resolvedCount++

    // Step 2: List all fund.at.graph.endorse records (resolved to DIDs)
    const endorsedDids = await fetchEndorsementsForDid(did, pdsUrl, didCache)
    scannedCount++
    onProgress?.(scannedCount, candidateDids.length)
    if (endorsedDids.length === 0) return
    withRecords++

    // Step 3: Aggregate into the map (keys are always DIDs now)
    for (const endorsedDid of endorsedDids) {
      let dids = endorsementMap.get(endorsedDid)
      if (!dids) {
        dids = new Set()
        endorsementMap.set(endorsedDid, dids)
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
  onProgress?: (scanned: number, total: number) => void,
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
  const map = await collectNetworkEndorsements(candidateDids, onProgress)
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
 * Look up endorsement counts for a DID from a pre-collected map.
 * Map keys are always DIDs (non-DID URIs are resolved during collection).
 */
export function getCountsFromMap(
  map: EndorsementMap,
  did: string,
): EndorsementCounts {
  const dids = map.get(did)
  return { networkEndorsementCount: dids?.size ?? 0 }
}
