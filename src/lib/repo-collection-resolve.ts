import type { Agent } from '@atproto/api'

/** Calendar events: attribute app via `createdWith` on each record (not the collection NSID). */
const CALENDAR_COLLECTION_PREFIX = 'community.lexicon.calendar'

/** Standard.site: attribute app via `content.$type` inside each record. */
const STANDARD_COLLECTION_PREFIX = 'site.standard.'

const LIST_LIMIT = 50

function isCalendarCollection(nsid: string): boolean {
  return (
    nsid === CALENDAR_COLLECTION_PREFIX ||
    nsid.startsWith(`${CALENDAR_COLLECTION_PREFIX}.`)
  )
}

function isStandardSiteCollection(nsid: string): boolean {
  return nsid === 'site.standard' || nsid.startsWith(STANDARD_COLLECTION_PREFIX)
}

/** Drop collections we resolve via repo record inspection (see {@link resolveDerivedCatalogKeys}). */
export function stripDerivedCollections(collections: readonly string[]): string[] {
  return collections.filter(
    (c) => !isCalendarCollection(c) && !isStandardSiteCollection(c),
  )
}

function readCreatedWith(value: Record<string, unknown>): string | null {
  const cw = value.createdWith
  return typeof cw === 'string' && cw.length > 0 ? cw : null
}

function readContentType(value: Record<string, unknown>): string | null {
  const content = value.content
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return null
  }
  const t = (content as { $type?: unknown }).$type
  return typeof t === 'string' && t.length > 0 ? t : null
}

async function listRecordValues(
  agent: Agent,
  repo: string,
  collection: string,
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  try {
    const res = await agent.com.atproto.repo.listRecords({
      repo,
      collection,
      limit: LIST_LIMIT,
    })
    const records = res.data.records ?? []
    for (const r of records) {
      const v = r.value
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out.push(v as Record<string, unknown>)
      }
    }
  } catch {
    return []
  }
  return out
}

/**
 * NSIDs to pass into catalog lookup after inspecting calendar records (`createdWith`).
 */
export async function resolveCalendarCatalogKeys(
  agent: Agent,
  repo: string,
  collections: readonly string[],
): Promise<string[]> {
  const keys = new Set<string>()

  for (const collection of collections) {
    if (!isCalendarCollection(collection)) continue
    const values = await listRecordValues(agent, repo, collection)
    for (const value of values) {
      const k = readCreatedWith(value)
      if (k) keys.add(k)
    }
  }

  return [...keys].sort((a, b) => a.localeCompare(b))
}

export type SiteStandardPair = {
  /** Repo collection, e.g. `site.standard.document` (correct for PDSls explorer). */
  siteCollection: string
  /** `content.$type` inside the record (e.g. Leaflet block types). */
  contentType: string
}

/**
 * Unique (site collection × content type) pairs from `site.standard.*` records.
 * Does not use `contentType` as a synthetic collection name — that broke explorer links.
 */
export async function resolveSiteStandardPairs(
  agent: Agent,
  repo: string,
  collections: readonly string[],
): Promise<SiteStandardPair[]> {
  const seen = new Set<string>()
  const pairs: SiteStandardPair[] = []

  for (const collection of collections) {
    if (!isStandardSiteCollection(collection)) continue
    const values = await listRecordValues(agent, repo, collection)
    for (const value of values) {
      const contentType = readContentType(value)
      if (!contentType) continue
      const key = `${collection}|${contentType}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push({ siteCollection: collection, contentType })
    }
  }

  return pairs.sort((a, b) => {
    const c = a.siteCollection.localeCompare(b.siteCollection)
    return c !== 0 ? c : a.contentType.localeCompare(b.contentType)
  })
}
