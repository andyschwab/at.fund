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
// Discovery: look up ecosystem entries in a pre-collected endorsement map
// ---------------------------------------------------------------------------

/**
 * Discovers ecosystem URIs by combining:
 * 1. Curated catalog entries tagged "ecosystem" (always shown)
 * 2. Network endorsement counts from the pre-collected endorsement map
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

  for (const cat of catalogEntries) {
    const result = getCountsFromMap(endorsementMap, cat.stewardUri)
    uris.set(cat.stewardUri, {
      // Without a global index, endorsementCount = network count
      endorsementCount: result.networkEndorsementCount,
      networkEndorsementCount: result.networkEndorsementCount,
    })
  }

  logger.info('ecosystem: discovery completed', {
    catalogCount: catalogEntries.length,
    totalUris: uris.size,
    withEndorsements: [...uris.values()].filter((c) => c.endorsementCount > 0).length,
  })

  return { uris }
}
