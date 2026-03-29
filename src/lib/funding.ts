import { lookupCatalog } from '@/lib/catalog'

export type RowSource = 'repo' | 'self-reported'

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
    return `${parts[2]}.${parts[1]}`
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

export function buildRows(
  repoCollections: readonly string[],
  selfReported: readonly string[],
): ContributionRow[] {
  const repoSet = new Set(repoCollections)
  const rows: ContributionRow[] = []

  for (const c of repoCollections) {
    rows.push(rowFor(c, 'repo'))
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
    const notes = groupRows.find((r) => r.notes)?.notes
    const links = mergeLinks(groupRows.map((r) => r.links))
    groups.push({ appName, collections, links, confidence, notes })
  }

  return groups.sort((a, b) => a.appName.localeCompare(b.appName))
}
