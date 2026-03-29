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

/** Longest matching prefix wins. */
export function lookupCatalog(nsid: string): CatalogEntry | null {
  let best: CatalogEntry | null = null
  for (const e of catalog.entries) {
    if (nsid === e.prefix || nsid.startsWith(e.prefix)) {
      if (!best || e.prefix.length > best.prefix.length) {
        best = e
      }
    }
  }
  return best
}
