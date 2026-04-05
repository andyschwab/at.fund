import type { StewardEntry } from '@/lib/steward-model'

/**
 * Canonical "how fundable is this entry?" ranking.
 * Lower number = more fundable = should appear first.
 *
 * Used for sorting entries in the main list, dependency rows, and steward
 * results. Subsumes the former stewardTier, entryTier, and depRowTier.
 *
 * Tiers:
 *   0 — Has a contributeUrl (directly fundable)
 *   1 — A dependency has a contributeUrl (1 hop)
 *   2 — A dependency's dependency has a contributeUrl (2 hops)
 *   3 — Has dependencies but none are fundable
 *   4 — No dependencies, no contributeUrl
 *   5 — Unknown / unresolved (no useful data)
 */
export function entryPriority(
  entry: StewardEntry | undefined,
  lookup?: (uri: string) => StewardEntry | undefined,
): number {
  if (!entry) return 5
  if (entry.contributeUrl) return 0

  if (entry.dependencies?.length && lookup) {
    // 1-hop: any direct dep is fundable
    if (entry.dependencies.some((uri) => lookup(uri)?.contributeUrl)) return 1
    // 2-hop: any dep's dep is fundable
    if (
      entry.dependencies.some((uri) => {
        const dep = lookup(uri)
        return dep?.dependencies?.some((dUri) => lookup(dUri)?.contributeUrl)
      })
    )
      return 2
    return 3
  }

  if (entry.dependencies?.length) return 3

  // Unknown source with no funding data at all → lowest
  if (entry.source === 'unknown') return 5

  return 4
}
