import { getEndorsersForUris } from '@/lib/microcosm'
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
// Discovery: query Constellation for complete endorsement data
// ---------------------------------------------------------------------------

/**
 * Discovers ecosystem URIs by combining:
 * 1. Curated catalog entries tagged "ecosystem" (always shown)
 * 2. Network-discovered URIs endorsed by 1+ of the user's follows
 *
 * Uses Constellation (microcosm backlink index) for complete endorsement
 * data — no sampling limitations.
 */
export async function discoverEcosystem(
  followDids: Set<string>,
): Promise<EcosystemDiscovery> {
  const catalogEntries = getEcosystemCatalogEntries()
  const catalogUris = catalogEntries.map((c) => c.stewardUri)

  // Query Constellation for endorsement data on all catalog ecosystem URIs
  const backlinkResults = await getEndorsersForUris(catalogUris)

  // Build result map
  const uris = new Map<string, EndorsementCounts>()

  for (const cat of catalogEntries) {
    const backlinks = backlinkResults.get(cat.stewardUri)
    const endorserDids = backlinks?.endorserDids ?? []

    const networkCount = followDids.size > 0
      ? endorserDids.filter((did) => followDids.has(did)).length
      : 0

    uris.set(cat.stewardUri, {
      endorsementCount: endorserDids.length,
      networkEndorsementCount: networkCount,
    })
  }

  logger.info('ecosystem: discovery completed', {
    catalogCount: catalogEntries.length,
    totalUris: uris.size,
    withEndorsements: [...uris.values()].filter((c) => c.endorsementCount > 0).length,
    networkDiscovered: [...uris.values()].filter((c) => c.networkEndorsementCount > 0).length,
  })

  return { uris }
}

/**
 * Fetch endorsement counts for a set of arbitrary URIs (for display on any card).
 * Queries Constellation in parallel with caching.
 */
export async function fetchEndorsementCounts(
  uris: string[],
  followDids: Set<string>,
): Promise<Map<string, EndorsementCounts>> {
  if (uris.length === 0) return new Map()

  const backlinkResults = await getEndorsersForUris(uris)
  const counts = new Map<string, EndorsementCounts>()

  for (const [uri, backlinks] of backlinkResults) {
    const networkCount = followDids.size > 0
      ? backlinks.endorserDids.filter((did) => followDids.has(did)).length
      : 0

    counts.set(uri, {
      endorsementCount: backlinks.totalCount,
      networkEndorsementCount: networkCount,
    })
  }

  return counts
}
