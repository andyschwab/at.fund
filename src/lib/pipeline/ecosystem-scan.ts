import type { StewardEntry } from '@/lib/steward-model'
import { getAllEndorsements } from '@/lib/microcosm'
import { getEcosystemCatalogEntries, lookupManualStewardRecord } from '@/lib/catalog'
import { normalizeStewardUri } from '@/lib/steward-uri'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EcosystemEntry = StewardEntry & {
  endorsementCount: number
  networkEndorsementCount: number
}

type UriAggregation = {
  globalCount: number
  networkDids: Set<string>
}

// ---------------------------------------------------------------------------
// Phase 5: Ecosystem discovery
// ---------------------------------------------------------------------------

/**
 * Discovers ecosystem entries by combining:
 * 1. Curated catalog entries tagged "ecosystem" (always shown)
 * 2. Network-discovered entries endorsed by the user's follows
 *
 * Returns entries sorted by global endorsement count descending.
 */
export async function scanEcosystem(
  followDids: Set<string>,
  existingUris: Set<string>,
  onStatus?: (msg: string) => void,
): Promise<EcosystemEntry[]> {
  onStatus?.('Loading ecosystem endorsements…')

  // ── Fetch all endorsement records from the network ──────────────────
  const allRecords = await getAllEndorsements()

  // ── Build aggregation map: endorsedUri → { globalCount, networkDids } ─
  const aggregation = new Map<string, UriAggregation>()

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

  // ── Always include catalog ecosystem entries ────────────────────────
  const catalogEntries = getEcosystemCatalogEntries()
  const results = new Map<string, EcosystemEntry>()

  for (const cat of catalogEntries) {
    const uri = cat.stewardUri
    if (existingUris.has(uri)) continue // already in scan results

    const agg = aggregation.get(uri)
    results.set(uri, {
      uri,
      tags: ['ecosystem'],
      displayName: uri,
      source: 'manual',
      contributeUrl: cat.contributeUrl,
      dependencies: cat.dependencies,
      endorsementCount: agg?.globalCount ?? 0,
      networkEndorsementCount: agg?.networkDids.size ?? 0,
    })
  }

  // ── Add network-discovered entries (endorsed by 1+ follow) ──────────
  for (const [uri, agg] of aggregation) {
    if (agg.networkDids.size === 0) continue // no follows endorse this
    if (existingUris.has(uri)) continue // already in scan results
    if (results.has(uri)) continue // already added as catalog entry

    // Try to enrich from catalog
    const manual = lookupManualStewardRecord(uri)
    results.set(uri, {
      uri,
      tags: ['ecosystem'],
      displayName: manual?.stewardUri ?? uri,
      source: manual ? 'manual' : 'unknown',
      contributeUrl: manual?.contributeUrl,
      dependencies: manual?.dependencies,
      endorsementCount: agg.globalCount,
      networkEndorsementCount: agg.networkDids.size,
    })
  }

  // ── Sort by global endorsement count descending ─────────────────────
  const sorted = [...results.values()].sort(
    (a, b) => b.endorsementCount - a.endorsementCount || a.uri.localeCompare(b.uri),
  )

  logger.info('ecosystem: scan completed', {
    catalogCount: catalogEntries.length,
    networkCount: sorted.filter((e) => e.networkEndorsementCount > 0).length,
    totalCount: sorted.length,
  })

  return sorted
}
