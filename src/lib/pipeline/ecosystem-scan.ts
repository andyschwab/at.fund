import { getAllEndorsements } from '@/lib/microcosm'
import { getEcosystemCatalogEntries } from '@/lib/catalog'
import { normalizeStewardUri } from '@/lib/steward-uri'
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
  /** URI → endorsement counts for every URI we want to show. */
  uris: Map<string, EndorsementCounts>
}

// ---------------------------------------------------------------------------
// Discovery: fetch UFOs data and figure out which URIs matter
// ---------------------------------------------------------------------------

/**
 * Discovers ecosystem URIs by combining:
 * 1. Curated catalog entries tagged "ecosystem" (always shown)
 * 2. Network-discovered URIs endorsed by 1+ of the user's follows
 *
 * This is a pure data fetch — no entry resolution. The caller injects
 * discovered URIs into the normal enrichment pipeline.
 */
export async function discoverEcosystem(
  followDids: Set<string>,
): Promise<EcosystemDiscovery> {
  // ── Fetch all endorsement records from the network ──────────────────
  const allRecords = await getAllEndorsements()

  // ── Build aggregation map: normalizedUri → counts ───────────────────
  const aggregation = new Map<string, { globalCount: number; networkDids: Set<string> }>()

  for (const record of allRecords) {
    const rawUri = record.record?.uri
    if (typeof rawUri !== 'string' || !rawUri.trim()) continue

    const normalized = normalizeStewardUri(rawUri) ?? rawUri.trim()

    let agg = aggregation.get(normalized)
    if (!agg) {
      agg = { globalCount: 0, networkDids: new Set() }
      aggregation.set(normalized, agg)
    }
    agg.globalCount++
    if (followDids.has(record.did)) {
      agg.networkDids.add(record.did)
    }
  }

  // ── Collect URIs to show ────────────────────────────────────────────
  const uris = new Map<string, EndorsementCounts>()

  // Always include catalog ecosystem entries
  for (const cat of getEcosystemCatalogEntries()) {
    const agg = aggregation.get(cat.stewardUri)
    uris.set(cat.stewardUri, {
      endorsementCount: agg?.globalCount ?? 0,
      networkEndorsementCount: agg?.networkDids.size ?? 0,
    })
  }

  // Add network-discovered entries (endorsed by 1+ follow)
  for (const [uri, agg] of aggregation) {
    if (agg.networkDids.size === 0) continue
    if (uris.has(uri)) continue // already in catalog set
    uris.set(uri, {
      endorsementCount: agg.globalCount,
      networkEndorsementCount: agg.networkDids.size,
    })
  }

  logger.info('ecosystem: discovery completed', {
    recordCount: allRecords.length,
    catalogCount: getEcosystemCatalogEntries().length,
    networkDiscovered: uris.size - getEcosystemCatalogEntries().length,
    totalUris: uris.size,
  })

  return { uris }
}
