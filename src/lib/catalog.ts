import catalogJson from '@/data/lexicon-catalog.json'

export type CatalogConfidence = 'curated' | 'unknown'

export type CatalogEntry = {
  prefix: string
  appName: string
  confidence: CatalogConfidence
  links: { label: string; url: string }[]
  notes?: string
}

type CatalogFile = {
  entries: CatalogEntry[]
}

const catalog = catalogJson as CatalogFile

function normalizePrefix(prefix: string): string {
  // We store NSID prefixes with a trailing dot in the catalog, but accept either form.
  // Some derived keys (e.g. calendar `createdWith`) may be full URLs; do not append dots.
  if (prefix.includes('://')) return prefix
  return prefix.endsWith('.') ? prefix : `${prefix}.`
}

/** Longest matching prefix wins. */
export function lookupCatalog(nsid: string): CatalogEntry | null {
  let best: CatalogEntry | null = null
  for (const e of catalog.entries) {
    const p = normalizePrefix(e.prefix)
    const exactOk = nsid === e.prefix || (!p.includes('://') && nsid === p.slice(0, -1))
    if (exactOk || nsid.startsWith(p)) {
      if (!best || p.length > normalizePrefix(best.prefix).length) {
        best = e
      }
    }
  }
  return best
}
