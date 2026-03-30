import { lookupCatalog } from '@/lib/catalog'
import type { SiteStandardPair } from '@/lib/repo-collection-resolve'

export type RowSource = 'repo' | 'self-reported'

/** Shown alongside the authoring tool when data lives in `site.standard.*` records. */
export const STANDARD_SITE_SCHEMA_LINKS: { label: string; url: string }[] = [
  { label: 'Standard.site', url: 'https://standard.site' },
  {
    label: 'Standard.site lexicons',
    url: 'https://tangled.org/standard.site/lexicons',
  },
  {
    label: 'site.standard.document (Lexicon Garden)',
    url:
      'https://eu.lexicon.garden/lexicon/did:plc:uqzpqmrjnptsxezjx4xuh2mn/site.standard.document',
  },
]

export type ContributionRow = {
  collection: string
  appName: string
  links: { label: string; url: string }[]
  confidence: 'curated' | 'unknown'
  source: RowSource
  notes?: string
}

function inferAppNameFromNsid(nsid: string): string {
  const parts = nsid.split('.')
  if (parts.length >= 3) {
    // NSID authority is the first two labels in reverse-DNS order: <tld>.<root>
    // Example: app.bsky.feed.post -> app.bsky
    return `${parts[0]}.${parts[1]}`
  }
  return nsid
}

function rowFor(collection: string, source: RowSource): ContributionRow {
  const hit = lookupCatalog(collection)
  return {
    collection,
    appName: hit?.appName ?? inferAppNameFromNsid(collection),
    links: hit?.links ?? [],
    confidence: hit?.confidence ?? 'unknown',
    source,
    notes: hit?.notes,
  }
}

function rowForSiteStandardContent(
  pair: SiteStandardPair,
  source: RowSource,
): ContributionRow {
  const { siteCollection, contentType } = pair
  const contentHit = lookupCatalog(contentType)
  const appName = contentHit?.appName ?? inferAppNameFromNsid(contentType)
  const links = mergeLinks([
    contentHit?.links ?? [],
    STANDARD_SITE_SCHEMA_LINKS,
  ])
  const confidence = contentHit?.confidence ?? 'unknown'
  const toolName = contentHit?.appName ?? inferAppNameFromNsid(contentType)
  const notes = `${toolName}-generated content (\`${contentType}\`) in Standard.site storage — collection \`${siteCollection}\`.`

  return {
    collection: siteCollection,
    appName,
    links,
    confidence,
    source,
    notes,
  }
}

export function buildRows(
  repoCollections: readonly string[],
  selfReported: readonly string[],
): ContributionRow[] {
  return buildRowsWithDerivatives(repoCollections, [], selfReported)
}

/** Calendar keys and static collection NSIDs; site.standard pairs are built separately so explorer links stay on real collections. */
export function buildRowsWithDerivatives(
  repoCollections: readonly string[],
  siteStandardPairs: readonly SiteStandardPair[],
  selfReported: readonly string[],
): ContributionRow[] {
  const repoSet = new Set(repoCollections)
  const rows: ContributionRow[] = []

  for (const c of repoCollections) {
    rows.push(rowFor(c, 'repo'))
  }

  for (const pair of siteStandardPairs) {
    rows.push(rowForSiteStandardContent(pair, 'repo'))
  }

  for (const c of selfReported) {
    if (repoSet.has(c)) continue
    rows.push(rowFor(c, 'self-reported'))
  }

  return rows.sort((a, b) => a.collection.localeCompare(b.collection))
}

export type AppProjectGroup = {
  appName: string
  collections: string[]
  links: { label: string; url: string }[]
  confidence: 'curated' | 'unknown'
  notes?: string
}

function mergeLinks(
  groups: ReadonlyArray<ReadonlyArray<{ label: string; url: string }>>,
): { label: string; url: string }[] {
  const seen = new Set<string>()
  const out: { label: string; url: string }[] = []
  for (const group of groups) {
    for (const l of group) {
      if (!seen.has(l.url)) {
        seen.add(l.url)
        out.push(l)
      }
    }
  }
  return out
}

/** One row per app/project; collections are listed for drill-down only. */
export function groupRowsByApp(rows: readonly ContributionRow[]): AppProjectGroup[] {
  const byApp = new Map<string, ContributionRow[]>()
  for (const row of rows) {
    const list = byApp.get(row.appName) ?? []
    list.push(row)
    byApp.set(row.appName, list)
  }

  const groups: AppProjectGroup[] = []
  for (const [, groupRows] of byApp) {
    const appName = groupRows[0].appName
    const collections = [...new Set(groupRows.map((r) => r.collection))].sort(
      (a, b) => a.localeCompare(b),
    )
    const confidence = groupRows.some((r) => r.confidence === 'curated')
      ? 'curated'
      : 'unknown'
    const noteParts = [
      ...new Set(groupRows.map((r) => r.notes).filter(Boolean)),
    ] as string[]
    const notes =
      noteParts.length > 0 ? noteParts.join('\n\n') : undefined
    const links = mergeLinks(groupRows.map((r) => r.links))
    groups.push({ appName, collections, links, confidence, notes })
  }

  return groups.sort((a, b) => a.appName.localeCompare(b.appName))
}
