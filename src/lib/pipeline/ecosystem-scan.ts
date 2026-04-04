import { getNetworkEndorsementsForUris } from '@/lib/microcosm'
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
// Discovery: check follow repos for endorsement records via Slingshot
// ---------------------------------------------------------------------------

/**
 * Discovers ecosystem URIs by combining:
 * 1. Curated catalog entries tagged "ecosystem" (always shown)
 * 2. Network endorsement counts from the user's follows
 *
 * Uses Slingshot (microcosm record proxy) to check each follow's repo
 * for fund.at.endorse records. Since rkey = endorsed URI, this is a
 * simple existence check per (follow, ecosystemUri) pair.
 */
export async function discoverEcosystem(
  followDids: Set<string>,
): Promise<EcosystemDiscovery> {
  const catalogEntries = getEcosystemCatalogEntries()
  const catalogUris = catalogEntries.map((c) => c.stewardUri)

  const uris = new Map<string, EndorsementCounts>()

  if (followDids.size > 0 && catalogUris.length > 0) {
    // Query Slingshot for endorsement records across all follows
    const endorsementResults = await getNetworkEndorsementsForUris(
      catalogUris,
      [...followDids],
    )

    for (const cat of catalogEntries) {
      const result = endorsementResults.get(cat.stewardUri)
      uris.set(cat.stewardUri, {
        // We don't have total counts without a full index — show network count
        endorsementCount: result?.networkEndorsementCount ?? 0,
        networkEndorsementCount: result?.networkEndorsementCount ?? 0,
      })
    }
  } else {
    // No follows available — just list catalog entries with zero counts
    for (const cat of catalogEntries) {
      uris.set(cat.stewardUri, { endorsementCount: 0, networkEndorsementCount: 0 })
    }
  }

  logger.info('ecosystem: discovery completed', {
    catalogCount: catalogEntries.length,
    totalUris: uris.size,
    followsChecked: followDids.size,
    withEndorsements: [...uris.values()].filter((c) => c.endorsementCount > 0).length,
  })

  return { uris }
}
