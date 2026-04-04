/**
 * Typed client for Microcosm.blue services.
 *
 * UFOs API — samples and statistics of atproto records by collection NSID.
 *   Docs: https://ufos-api.microcosm.blue/
 *   Key insight: UFOs provides *samples* (most recent records) and *statistics*
 *   (creates, deletes, DID estimates, timeseries), NOT a full record dump.
 *
 * Constellation API — atproto-wide backlink index.
 *   Docs: https://constellation.microcosm.blue/
 */

import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const UFOS_API = 'https://ufos-api.microcosm.blue'
const CONSTELLATION_API = 'https://constellation.microcosm.blue'

const REQUEST_TIMEOUT_MS = 15_000

// ---------------------------------------------------------------------------
// UFOs types
// ---------------------------------------------------------------------------

/** A collection entry from GET /collections or GET /prefix */
export type UfosCollectionInfo = {
  nsid: string
  creates: number
  deletes: number
  dids_estimate: number
  updates: number
  /** Present on /prefix children */
  type?: 'collection'
}

/** Response from GET /collections (paginated) */
export type UfosCollectionsResponse = {
  collections: UfosCollectionInfo[]
  cursor: string | null
}

/** Response from GET /prefix */
export type UfosPrefixResponse = {
  children: UfosCollectionInfo[]
  cursor: string | null
  total: {
    creates: number
    deletes: number
    dids_estimate: number
    updates: number
  }
}

/** A record sample from GET /records */
export type UfosRecordSample = {
  collection: string
  did: string
  rkey: string
  record: Record<string, unknown>
  /** Microsecond timestamp */
  time_us: number
}

/** Stats for a time bucket (from /collections/stats and /timeseries) */
export type UfosStatsBucket = {
  creates: number
  deletes: number
  dids_estimate: number
  updates: number
}

/** Response from GET /collections/stats */
export type UfosCollectionStatsResponse = Record<string, UfosStatsBucket>

/** Response from GET /timeseries */
export type UfosTimeseriesResponse = {
  range: string[]
  series: Record<string, UfosStatsBucket[]>
}

// ---------------------------------------------------------------------------
// Constellation types
// ---------------------------------------------------------------------------

/** Response from /links/all/count — { [nsid]: { [jsonpath]: count } } */
export type ConstellationAllCounts = Record<string, Record<string, number>>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    return await res.text()
  } finally {
    clearTimeout(timeout)
  }
}

// ---------------------------------------------------------------------------
// UFOs API — Collections
// ---------------------------------------------------------------------------

/**
 * List collections with stats. Supports cursor-based pagination.
 * Omit `order` to paginate; use `order` for a sorted top-N (no paging).
 */
export async function listCollections(opts?: {
  cursor?: string
  limit?: number
  order?: 'records-created' | 'dids-estimate'
  since?: string
  until?: string
}): Promise<UfosCollectionsResponse> {
  const params = new URLSearchParams()
  if (opts?.cursor) params.set('cursor', opts.cursor)
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.order) params.set('order', opts.order)
  if (opts?.since) params.set('since', opts.since)
  if (opts?.until) params.set('until', opts.until)
  const qs = params.toString()
  return fetchJson<UfosCollectionsResponse>(
    `${UFOS_API}/collections${qs ? `?${qs}` : ''}`,
  )
}

/**
 * List all collections under a lexicon group prefix (e.g. "fund.at").
 */
export async function listPrefix(
  prefix: string,
  opts?: {
    cursor?: string
    limit?: number
    order?: 'records-created' | 'dids-estimate'
    since?: string
    until?: string
  },
): Promise<UfosPrefixResponse> {
  const params = new URLSearchParams({ prefix })
  if (opts?.cursor) params.set('cursor', opts.cursor)
  if (opts?.limit) params.set('limit', String(opts.limit))
  if (opts?.order) params.set('order', opts.order)
  if (opts?.since) params.set('since', opts.since)
  if (opts?.until) params.set('until', opts.until)
  return fetchJson<UfosPrefixResponse>(
    `${UFOS_API}/prefix?${params.toString()}`,
  )
}

// ---------------------------------------------------------------------------
// UFOs API — Stats
// ---------------------------------------------------------------------------

/**
 * Get aggregate stats for one or more collections over a time period.
 * Default range: last 7 days.
 */
export async function getCollectionStats(
  collections: string[],
  opts?: { since?: string; until?: string },
): Promise<UfosCollectionStatsResponse> {
  const params = new URLSearchParams()
  for (const c of collections) params.append('collection', c)
  if (opts?.since) params.set('since', opts.since)
  if (opts?.until) params.set('until', opts.until)
  return fetchJson<UfosCollectionStatsResponse>(
    `${UFOS_API}/collections/stats?${params.toString()}`,
  )
}

/**
 * Get timeseries stats for a collection.
 * Default range: last 7 days, default step: 24 hours.
 */
export async function getTimeseries(
  collection: string,
  opts?: { since?: string; until?: string; step?: number },
): Promise<UfosTimeseriesResponse> {
  const params = new URLSearchParams({ collection })
  if (opts?.since) params.set('since', opts.since)
  if (opts?.until) params.set('until', opts.until)
  if (opts?.step) params.set('step', String(opts.step))
  return fetchJson<UfosTimeseriesResponse>(
    `${UFOS_API}/timeseries?${params.toString()}`,
  )
}

// ---------------------------------------------------------------------------
// UFOs API — Record Samples
// ---------------------------------------------------------------------------

/**
 * Get most recent record samples for one or more collections.
 * Returns a flat array of recent records seen in the firehose.
 */
export async function getRecordSamples(
  collections: string[],
): Promise<UfosRecordSample[]> {
  const params = new URLSearchParams()
  for (const c of collections) params.append('collection', c)
  return fetchJson<UfosRecordSample[]>(
    `${UFOS_API}/records?${params.toString()}`,
  )
}

// ---------------------------------------------------------------------------
// UFOs API — Search
// ---------------------------------------------------------------------------

export type UfosSearchResult = {
  matches: UfosCollectionInfo[]
}

/** Search lexicons by query string (min 2 alphanumeric chars). */
export async function searchLexicons(q: string): Promise<UfosSearchResult> {
  const params = new URLSearchParams({ q })
  return fetchJson<UfosSearchResult>(
    `${UFOS_API}/search?${params.toString()}`,
  )
}

// ---------------------------------------------------------------------------
// Constellation API
// ---------------------------------------------------------------------------

/**
 * Count backlinks to a target URI from a specific collection+path.
 *
 * Example: count endorsements targeting a DID:
 *   getLinksCount(did, 'fund.at.endorse', '.uri')
 */
export async function getLinksCount(
  target: string,
  collection: string,
  path: string,
): Promise<number> {
  const params = new URLSearchParams({ target, collection, path })
  const text = await fetchText(
    `${CONSTELLATION_API}/links/count?${params.toString()}`,
  )
  const n = parseInt(text, 10)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Count ALL backlinks to a target URI, grouped by collection+path.
 *
 * Returns e.g.:
 *   { "fund.at.endorse": { ".uri": 5 }, "fund.at.dependency": { ".uri": 12 } }
 */
export async function getAllLinksCounts(
  target: string,
): Promise<ConstellationAllCounts> {
  const params = new URLSearchParams({ target })
  return fetchJson<ConstellationAllCounts>(
    `${CONSTELLATION_API}/links/all/count?${params.toString()}`,
  )
}

// ---------------------------------------------------------------------------
// Safe wrappers — return fallback on error
// ---------------------------------------------------------------------------

export async function safeListPrefix(
  prefix: string,
  opts?: Parameters<typeof listPrefix>[1],
): Promise<UfosPrefixResponse> {
  try {
    return await listPrefix(prefix, opts)
  } catch (e) {
    logger.warn('microcosm: listPrefix failed', {
      prefix,
      error: e instanceof Error ? e.message : String(e),
    })
    return { children: [], cursor: null, total: { creates: 0, deletes: 0, dids_estimate: 0, updates: 0 } }
  }
}

export async function safeGetCollectionStats(
  collections: string[],
  opts?: Parameters<typeof getCollectionStats>[1],
): Promise<UfosCollectionStatsResponse> {
  try {
    return await getCollectionStats(collections, opts)
  } catch (e) {
    logger.warn('microcosm: getCollectionStats failed', {
      collections,
      error: e instanceof Error ? e.message : String(e),
    })
    return {}
  }
}

export async function safeGetRecordSamples(
  collections: string[],
): Promise<UfosRecordSample[]> {
  try {
    return await getRecordSamples(collections)
  } catch (e) {
    logger.warn('microcosm: getRecordSamples failed', {
      collections,
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

export async function safeGetTimeseries(
  collection: string,
  opts?: Parameters<typeof getTimeseries>[1],
): Promise<UfosTimeseriesResponse> {
  try {
    return await getTimeseries(collection, opts)
  } catch (e) {
    logger.warn('microcosm: getTimeseries failed', {
      collection,
      error: e instanceof Error ? e.message : String(e),
    })
    return { range: [], series: {} }
  }
}

export async function safeGetAllLinksCounts(
  target: string,
): Promise<ConstellationAllCounts> {
  try {
    return await getAllLinksCounts(target)
  } catch (e) {
    logger.warn('microcosm: getAllLinksCounts failed', {
      target,
      error: e instanceof Error ? e.message : String(e),
    })
    return {}
  }
}
