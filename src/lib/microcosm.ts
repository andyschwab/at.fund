import { logger } from '@/lib/logger'

const UFOS_BASE = 'https://ufos-api.microcosm.blue'

// ---------------------------------------------------------------------------
// Types — match the actual UFOs API response format
// ---------------------------------------------------------------------------

export type EndorseRecord = {
  did: string
  collection: string
  rkey: string
  record: { $type?: string; uri?: string; createdAt?: string; [key: string]: unknown }
  time_us: number
}

type CollectionStats = {
  creates: number
  deletes: number
  dids_estimate: number
  updates?: number
}

// ---------------------------------------------------------------------------
// Server-side cache
// ---------------------------------------------------------------------------

type EndorsementCache = {
  records: EndorseRecord[]
  stats: CollectionStats | null
  fetchedAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

let _cache: EndorsementCache | null = null

// ---------------------------------------------------------------------------
// Fetch from UFOs API
// ---------------------------------------------------------------------------

/**
 * GET /records?collection=fund.at.endorse
 *
 * Returns a flat array of the most recent ~42 sample records.
 * This is a sample, not the full dataset — UFOs is a firehose stats service.
 */
async function fetchRecordSamples(): Promise<EndorseRecord[]> {
  try {
    const res = await fetch(`${UFOS_BASE}/records?collection=fund.at.endorse`)
    if (!res.ok) {
      logger.warn('microcosm: UFOs /records error', { status: res.status })
      return []
    }
    // Response is a flat array, not wrapped in an object
    const data = (await res.json()) as EndorseRecord[]
    if (!Array.isArray(data)) {
      logger.warn('microcosm: unexpected /records response shape')
      return []
    }
    return data
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('microcosm: /records fetch failed', { error: msg })
    return []
  }
}

/**
 * GET /collections/stats?collection=fund.at.endorse
 *
 * Returns aggregate stats: total creates (endorsements written),
 * deletes, and estimated unique DIDs.
 */
async function fetchCollectionStats(): Promise<CollectionStats | null> {
  try {
    const res = await fetch(
      `${UFOS_BASE}/collections/stats?collection=fund.at.endorse`,
    )
    if (!res.ok) {
      logger.warn('microcosm: UFOs /collections/stats error', { status: res.status })
      return null
    }
    const data = (await res.json()) as Record<string, CollectionStats>
    return data['fund.at.endorse'] ?? null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('microcosm: /collections/stats fetch failed', { error: msg })
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API — cached
// ---------------------------------------------------------------------------

export type EndorsementData = {
  /** Recent sample of endorsement records (up to ~42). */
  records: EndorseRecord[]
  /** Aggregate stats for the fund.at.endorse collection. */
  stats: CollectionStats | null
}

/** Returns cached endorsement data, refreshing if stale. */
export async function getEndorsementData(): Promise<EndorsementData> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return { records: _cache.records, stats: _cache.stats }
  }

  // Fetch records and stats in parallel
  const [records, stats] = await Promise.all([
    fetchRecordSamples(),
    fetchCollectionStats(),
  ])

  // Only update cache if we got data, or if cache is empty
  if (records.length > 0 || stats || !_cache) {
    _cache = { records, stats, fetchedAt: Date.now() }
  }

  return { records: _cache.records, stats: _cache.stats }
}
