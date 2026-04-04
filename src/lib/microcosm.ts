/**
 * Typed client for Microcosm.blue services.
 *
 * - UFOs API: network-wide record samples & stats for any AT Protocol lexicon
 * - Constellation API: backlink index (who links to whom across the ATmosphere)
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

export type UfosCollection = {
  nsid: string
  count: number
}

/** A single record returned by UFOs /collections/{nsid}/records */
export type UfosRecord = {
  /** AT URI of the record (at://did:plc:.../collection/rkey) */
  uri: string
  /** DID of the record author */
  did: string
  /** The record value (schema depends on the collection) */
  value: Record<string, unknown>
  /** Indexed-at timestamp from UFOs */
  indexedAt?: string
}

export type UfosRecordsPage = {
  records: UfosRecord[]
  cursor?: string
}

// ---------------------------------------------------------------------------
// Constellation types
// ---------------------------------------------------------------------------

/** Response from /links/count — plain number */
export type ConstellationCount = number

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
// UFOs API
// ---------------------------------------------------------------------------

/** List all known collections with record counts. */
export async function listCollections(): Promise<UfosCollection[]> {
  return fetchJson<UfosCollection[]>(`${UFOS_API}/collections`)
}

/**
 * Fetch a single page of records for a collection.
 * Supports cursor-based pagination.
 */
export async function fetchRecordsPage(
  nsid: string,
  cursor?: string,
): Promise<UfosRecordsPage> {
  const params = new URLSearchParams()
  if (cursor) params.set('cursor', cursor)
  const qs = params.toString()
  const url = `${UFOS_API}/collections/${encodeURIComponent(nsid)}/records${qs ? `?${qs}` : ''}`
  return fetchJson<UfosRecordsPage>(url)
}

/**
 * Fetch ALL records for a collection, paginating to completion.
 * Calls `onPage` with each page of results for incremental processing.
 */
export async function fetchAllRecords(
  nsid: string,
  opts?: {
    startCursor?: string
    onPage?: (page: UfosRecordsPage) => void
  },
): Promise<{ records: UfosRecord[]; lastCursor?: string }> {
  const all: UfosRecord[] = []
  let cursor = opts?.startCursor

  while (true) {
    const page = await fetchRecordsPage(nsid, cursor)
    all.push(...page.records)
    opts?.onPage?.(page)

    if (!page.cursor || page.records.length === 0) {
      break
    }
    cursor = page.cursor
  }

  return { records: all, lastCursor: cursor }
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
  const params = new URLSearchParams({
    target,
    collection,
    path,
  })
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

export async function safeListCollections(): Promise<UfosCollection[]> {
  try {
    return await listCollections()
  } catch (e) {
    logger.warn('microcosm: listCollections failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

export async function safeFetchAllRecords(
  nsid: string,
  opts?: {
    startCursor?: string
    onPage?: (page: UfosRecordsPage) => void
  },
): Promise<{ records: UfosRecord[]; lastCursor?: string }> {
  try {
    return await fetchAllRecords(nsid, opts)
  } catch (e) {
    logger.warn('microcosm: fetchAllRecords failed', {
      nsid,
      error: e instanceof Error ? e.message : String(e),
    })
    return { records: [], lastCursor: opts?.startCursor }
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
