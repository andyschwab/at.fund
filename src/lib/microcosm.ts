import { logger } from '@/lib/logger'

const UFOS_BASE = 'https://ufos-api.microcosm.blue'
const PAGE_LIMIT = 100

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EndorseRecord = {
  did: string
  collection: string
  rkey: string
  record: { $type: string; uri: string; createdAt?: string }
  time_us: number
}

type UfosResponse = {
  records: EndorseRecord[]
  cursor?: string | null
}

// ---------------------------------------------------------------------------
// Server-side cache
// ---------------------------------------------------------------------------

type EndorsementCache = {
  records: EndorseRecord[]
  fetchedAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

let _cache: EndorsementCache | null = null

// ---------------------------------------------------------------------------
// Fetch with pagination
// ---------------------------------------------------------------------------

async function fetchAllEndorsements(): Promise<EndorseRecord[]> {
  const all: EndorseRecord[] = []
  let cursor: string | undefined

  try {
    do {
      const url = new URL(`${UFOS_BASE}/records`)
      url.searchParams.set('collection', 'fund.at.endorse')
      url.searchParams.set('limit', String(PAGE_LIMIT))
      if (cursor) url.searchParams.set('cursor', cursor)

      const res = await fetch(url.toString())
      if (!res.ok) {
        logger.warn('microcosm: UFOs API error', { status: res.status })
        break
      }

      const data = (await res.json()) as UfosResponse
      const records = data.records ?? []
      all.push(...records)

      cursor = data.cursor ?? undefined
    } while (cursor)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('microcosm: UFOs fetch failed', { error: msg })
  }

  logger.info('microcosm: fetched endorsements', { count: all.length })
  return all
}

// ---------------------------------------------------------------------------
// Public API — cached
// ---------------------------------------------------------------------------

/** Returns all fund.at.endorse records from the network, cached for 5 minutes. */
export async function getAllEndorsements(): Promise<EndorseRecord[]> {
  if (_cache && Date.now() - _cache.fetchedAt < CACHE_TTL_MS) {
    return _cache.records
  }

  const records = await fetchAllEndorsements()

  // Only update cache if we got results, or if cache is empty (don't overwrite
  // good data with an empty response from a transient failure)
  if (records.length > 0 || !_cache) {
    _cache = { records, fetchedAt: Date.now() }
  }

  return _cache.records
}
