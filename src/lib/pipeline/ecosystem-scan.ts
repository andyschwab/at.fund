import type { EndorsementMap, EndorsementCounts } from '@/lib/microcosm'
import { getCountsFromMap } from '@/lib/microcosm'
import { getEcosystemCatalogEntries } from '@/lib/catalog'
import { logger } from '@/lib/logger'

export type { EndorsementCounts }

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

  // Always include catalog ecosystem entries (look up counts by DID when available)
  const catalogDids = new Set<string>()
  for (const cat of catalogEntries) {
    const key = cat.did ?? cat.stewardUri
    if (cat.did) catalogDids.add(cat.did)
    uris.set(cat.stewardUri, getCountsFromMap(endorsementMap, key))
  }

  // Add network-discovered entries: any DID endorsed by 1+ follows
  for (const [did, endorserDids] of endorsementMap) {
    if (catalogDids.has(did)) continue // already counted via catalog
    if (uris.has(did)) continue
    if (endorserDids.size === 0) continue

    uris.set(did, { networkEndorsementCount: endorserDids.size })
  }

  logger.info('ecosystem: discovery completed', {
    catalogCount: catalogEntries.length,
    networkDiscovered: uris.size - catalogEntries.length,
    totalUris: uris.size,
    withEndorsements: [...uris.values()].filter((c) => c.networkEndorsementCount > 0).length,
  })

  return { uris }
}
