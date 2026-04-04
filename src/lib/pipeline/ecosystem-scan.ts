import type { EndorsementMap } from '@/lib/microcosm'
import { getCountsFromMap } from '@/lib/microcosm'
import { getEcosystemCatalogEntries } from '@/lib/catalog'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EndorsementCounts = {
  endorsementCount: number
  networkEndorsementCount: number
}

/** Raw discovery result — URIs that should appear in the ecosystem section. */
export type EcosystemDiscovery = {
  /** URI → endorsement counts for every URI we want to show in ecosystem. */
  uris: Map<string, EndorsementCounts>
}

// ---------------------------------------------------------------------------
// Discovery: catalog entries + network-discovered URIs from endorsement map
// ---------------------------------------------------------------------------

/**
 * Discovers ecosystem URIs by combining:
 * 1. Curated catalog entries tagged "ecosystem" (always shown)
 * 2. Network-discovered URIs endorsed by 1+ follows (from endorsement map)
 *
 * The endorsement map is built by a single-pass over all follow DIDs
 * (via collectNetworkEndorsements in microcosm.ts), so this function
 * is a fast in-memory lookup — no API calls.
 */
export function discoverEcosystem(
  endorsementMap: EndorsementMap,
): EcosystemDiscovery {
  const catalogEntries = getEcosystemCatalogEntries()
  const uris = new Map<string, EndorsementCounts>()

  // Always include catalog ecosystem entries
  for (const cat of catalogEntries) {
    const result = getCountsFromMap(endorsementMap, cat.stewardUri)
    uris.set(cat.stewardUri, {
      endorsementCount: result.networkEndorsementCount,
      networkEndorsementCount: result.networkEndorsementCount,
    })
  }

  // Add network-discovered entries: any URI endorsed by 1+ follows
  for (const [uri, endorserDids] of endorsementMap) {
    if (uris.has(uri)) continue // already in catalog set
    if (endorserDids.size === 0) continue

    uris.set(uri, {
      endorsementCount: endorserDids.size,
      networkEndorsementCount: endorserDids.size,
    })
  }

  logger.info('ecosystem: discovery completed', {
    catalogCount: catalogEntries.length,
    networkDiscovered: uris.size - catalogEntries.length,
    totalUris: uris.size,
    withEndorsements: [...uris.values()].filter((c) => c.endorsementCount > 0).length,
  })

  return { uris }
}
