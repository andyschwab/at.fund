import { getRedisClient } from '@/lib/auth/kv-store'
import { normalizeStewardUri } from '@/lib/steward-uri'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Slingshot API — fast AT Protocol record proxy by Microcosm
// ---------------------------------------------------------------------------
//
// Constellation doesn't index fund.at.endorse (custom lexicon).
// Instead, we use Slingshot's getRecord to check each follow's repo
// for endorsement records. Since rkey = endorsed URI, checking
// "did X endorse URI Y?" is a single fast GET.
//
// Slingshot URL: https://slingshot.microcosm.blue
// ---------------------------------------------------------------------------

const SLINGSHOT_BASE = 'https://slingshot.microcosm.blue'
const CACHE_TTL_SECONDS = 15 * 60 // 15 minutes
const CACHE_PREFIX = 'endorse:slingshot:'
const CONCURRENCY = 20 // Slingshot is a fast cache proxy

const HEADERS = { 'User-Agent': 'at.fund/1.0 (endorsement-check)' }

// In-memory fallback when Redis is unavailable (local dev)
const memoryCache = new Map<string, { data: EndorsementResult; fetchedAt: number }>()

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EndorsementResult = {
  /** DIDs that endorsed this URI (from the checked set, e.g. follows). */
  endorserDids: string[]
  /** Count of endorsers found in the checked set. */
  networkEndorsementCount: number
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
// Slingshot queries
// ---------------------------------------------------------------------------

/**
 * Check if a single DID has endorsed a given URI via Slingshot.
 * Returns true if the record exists (200), false otherwise.
 */
async function checkEndorsement(
  did: string,
  endorsedUri: string,
): Promise<boolean> {
  const params = new URLSearchParams({
    repo: did,
    collection: 'fund.at.endorse',
    rkey: endorsedUri,
  })
  try {
    const res = await fetch(
      `${SLINGSHOT_BASE}/xrpc/com.atproto.repo.getRecord?${params}`,
      { headers: HEADERS },
    )
    return res.status === 200
  } catch {
    return false
  }
}

/**
 * Check which DIDs from a set have endorsed a given URI.
 * Queries Slingshot in parallel with concurrency control.
 */
async function findEndorsersForUri(
  targetUri: string,
  candidateDids: string[],
): Promise<string[]> {
  const endorsers: string[] = []

  await runWithConcurrency(candidateDids, CONCURRENCY, async (did) => {
    const endorsed = await checkEndorsement(did, targetUri)
    if (endorsed) endorsers.push(did)
    return endorsed
  })

  return endorsers
}

// ---------------------------------------------------------------------------
// Caching layer — Redis with in-memory fallback
// ---------------------------------------------------------------------------

function cacheKey(uri: string, didsHash: string): string {
  return `${CACHE_PREFIX}${uri}:${didsHash}`
}

/** Simple hash of sorted DID list for cache keying. */
function hashDids(dids: string[]): string {
  // Use count + first/last DID as a lightweight fingerprint.
  // Full hash would be better but this avoids crypto imports.
  if (dids.length === 0) return '0'
  const sorted = [...dids].sort()
  return `${dids.length}:${sorted[0]!.slice(-8)}:${sorted[sorted.length - 1]!.slice(-8)}`
}

async function getCached(uri: string, didsHash: string): Promise<EndorsementResult | null> {
  const key = cacheKey(uri, didsHash)

  const redis = getRedisClient()
  if (redis) {
    try {
      const cached = await redis.get<EndorsementResult>(key)
      if (cached) return cached
    } catch (e) {
      logger.warn('slingshot: redis get failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const mem = memoryCache.get(key)
  if (mem && Date.now() - mem.fetchedAt < CACHE_TTL_SECONDS * 1000) {
    return mem.data
  }

  return null
}

async function setCache(uri: string, didsHash: string, result: EndorsementResult): Promise<void> {
  const key = cacheKey(uri, didsHash)

  const redis = getRedisClient()
  if (redis) {
    try {
      await redis.set(key, result, { ex: CACHE_TTL_SECONDS })
    } catch (e) {
      logger.warn('slingshot: redis set failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  memoryCache.set(key, { data: result, fetchedAt: Date.now() })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check which DIDs from `candidateDids` have endorsed the given URI.
 * Uses Slingshot (fast record proxy) to check each DID's repo.
 * Results are cached by URI + DID set fingerprint.
 */
export async function getNetworkEndorsements(
  uri: string,
  candidateDids: string[],
): Promise<EndorsementResult> {
  const normalized = normalizeStewardUri(uri) ?? uri
  const didsHash = hashDids(candidateDids)

  const cached = await getCached(normalized, didsHash)
  if (cached) return cached

  const endorsers = await findEndorsersForUri(normalized, candidateDids)
  const result: EndorsementResult = {
    endorserDids: endorsers,
    networkEndorsementCount: endorsers.length,
  }

  await setCache(normalized, didsHash, result)
  return result
}

/**
 * Check endorsements for multiple URIs against the same set of candidate DIDs.
 * Runs URI checks sequentially (each URI fans out to CONCURRENCY DID checks).
 */
export async function getNetworkEndorsementsForUris(
  uris: string[],
  candidateDids: string[],
): Promise<Map<string, EndorsementResult>> {
  const results = new Map<string, EndorsementResult>()
  const normalized = uris.map((u) => normalizeStewardUri(u) ?? u)
  const unique = [...new Set(normalized)]

  // Process URIs sequentially — each one already fans out to many DID checks
  for (const uri of unique) {
    const result = await getNetworkEndorsements(uri, candidateDids)
    results.set(uri, result)
  }

  logger.info('slingshot: endorsement check complete', {
    urisChecked: unique.length,
    didsPerUri: candidateDids.length,
    totalQueries: unique.length * candidateDids.length,
    endorsementsFound: [...results.values()].reduce((s, r) => s + r.networkEndorsementCount, 0),
  })

  return results
}
