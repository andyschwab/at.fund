import { getEndorsementData } from '@/lib/microcosm'
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
  /** URI → endorsement counts for every URI we want to show in ecosystem. */
  uris: Map<string, EndorsementCounts>
  /** URI → endorsement counts for ALL URIs seen in the sample (for display on any card). */
  allCounts: Map<string, EndorsementCounts>
}

// ---------------------------------------------------------------------------
// Discovery: fetch UFOs data and figure out which URIs matter
// ---------------------------------------------------------------------------

/**
 * Discovers ecosystem URIs by combining:
 * 1. Curated catalog entries tagged "ecosystem" (always shown)
 * 2. Network-discovered URIs endorsed by 1+ of the user's follows
 *
 * Note: The UFOs /records endpoint returns a sample of ~42 recent records,
 * not the full dataset. Network endorsement counts from follows are derived
 * from this sample. Catalog entries are always included regardless.
 */
export async function discoverEcosystem(
  followDids: Set<string>,
): Promise<EcosystemDiscovery> {
  // ── Fetch endorsement data from the network ─────────────────────────
  const { records, stats } = await getEndorsementData()

  // ── Build per-URI aggregation from sample records ───────────────────
  const aggregation = new Map<string, { sampleCount: number; networkDids: Set<string> }>()

  for (const record of records) {
    const rawUri = record.record?.uri
    if (typeof rawUri !== 'string' || !rawUri.trim()) continue

    const normalized = normalizeStewardUri(rawUri) ?? rawUri.trim()

    let agg = aggregation.get(normalized)
    if (!agg) {
      agg = { sampleCount: 0, networkDids: new Set() }
      aggregation.set(normalized, agg)
    }
    agg.sampleCount++
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
      endorsementCount: agg?.sampleCount ?? 0,
      networkEndorsementCount: agg?.networkDids.size ?? 0,
    })
  }

  // Add network-discovered entries (endorsed by 1+ follow in the sample)
  for (const [uri, agg] of aggregation) {
    if (agg.networkDids.size === 0) continue
    if (uris.has(uri)) continue // already in catalog set
    uris.set(uri, {
      endorsementCount: agg.sampleCount,
      networkEndorsementCount: agg.networkDids.size,
    })
  }

  // ── Build full counts map for all URIs in the sample ─────────────────
  const allCounts = new Map<string, EndorsementCounts>()
  for (const [uri, agg] of aggregation) {
    allCounts.set(uri, {
      endorsementCount: agg.sampleCount,
      networkEndorsementCount: agg.networkDids.size,
    })
  }

  logger.info('ecosystem: discovery completed', {
    sampleRecords: records.length,
    globalStats: stats ? { creates: stats.creates, didsEstimate: stats.dids_estimate } : null,
    catalogCount: getEcosystemCatalogEntries().length,
    networkDiscovered: [...uris.values()].filter((c) => c.networkEndorsementCount > 0).length,
    totalUris: uris.size,
    allCountsUris: allCounts.size,
  })

  return { uris, allCounts }
}
