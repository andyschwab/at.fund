import type { StewardEntry, StewardSource, Capability } from '@/lib/steward-model'
import { isHumanReadableName } from '@/lib/steward-model'

// ---------------------------------------------------------------------------
// Source priority — higher index wins when merging display data
// ---------------------------------------------------------------------------

const SOURCE_PRIORITY: Record<StewardSource, number> = {
  'fund.at': 2,
  manual: 1,
  unknown: 0,
}

function betterSource(a: StewardSource, b: StewardSource): StewardSource {
  return SOURCE_PRIORITY[a] >= SOURCE_PRIORITY[b] ? a : b
}

// ---------------------------------------------------------------------------
// Merge two entries that share a DID
// ---------------------------------------------------------------------------

function mergeEntries(base: StewardEntry, incoming: StewardEntry): StewardEntry {
  const source = betterSource(base.source, incoming.source)
  const preferred = SOURCE_PRIORITY[incoming.source] >= SOURCE_PRIORITY[base.source]
    ? incoming : base
  const other = preferred === incoming ? base : incoming

  // Union tags, dedup
  const tags = [...new Set([...base.tags, ...incoming.tags])]

  // Prefer contributeUrl from higher-priority source
  const contributeUrl = preferred.contributeUrl ?? other.contributeUrl

  // Union dependencies
  const depSet = new Set([...(base.dependencies ?? []), ...(incoming.dependencies ?? [])])
  const dependencies = depSet.size > 0 ? [...depSet].sort() : undefined

  // Union capabilities, dedup by uri or type+name
  const allCaps = [...(base.capabilities ?? []), ...(incoming.capabilities ?? [])]
  const capabilities = deduplicateCapabilities(allCaps)

  // Prefer hostname URI over DID for readability
  const uri = (!base.uri.startsWith('did:') ? base.uri : null)
    ?? (!incoming.uri.startsWith('did:') ? incoming.uri : null)
    ?? base.uri

  // Prefer a meaningful displayName over a DID-shaped one
  const displayName =
    (isHumanReadableName(preferred.displayName))
      ? preferred.displayName
      : (isHumanReadableName(other.displayName))
        ? other.displayName
        : preferred.displayName ?? other.displayName

  return {
    uri,
    did: base.did ?? incoming.did,
    handle: base.handle ?? incoming.handle,
    tags,
    source,
    displayName,
    description: preferred.description ?? other.description,
    landingPage: preferred.landingPage ?? other.landingPage,
    avatar: preferred.avatar ?? other.avatar,
    contributeUrl,
    dependencies,
    capabilities,
    channels: preferred.channels ?? other.channels,
    plans: preferred.plans ?? other.plans,
  }
}

function deduplicateCapabilities(caps: Capability[]): Capability[] | undefined {
  if (caps.length === 0) return undefined
  const seen = new Set<string>()
  const result: Capability[] = []
  for (const c of caps) {
    const key = c.uri ?? `${c.type}:${c.name}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(c)
    }
  }
  return result.length > 0 ? result : undefined
}

// ---------------------------------------------------------------------------
// Public: merge entry lists into unified StewardEntry[]
// ---------------------------------------------------------------------------

export class EntryIndex {
  private byDid = new Map<string, StewardEntry>()
  private byUri = new Map<string, StewardEntry>()

  upsert(entry: StewardEntry) {
    if (entry.did) {
      const existing = this.byDid.get(entry.did)
      if (existing) {
        const merged = mergeEntries(existing, entry)
        this.byDid.set(entry.did, merged)
        if (this.byUri.get(existing.uri) === existing) this.byUri.set(existing.uri, merged)
        if (merged.uri !== existing.uri) this.byUri.set(merged.uri, merged)
        return
      }
    }
    // No DID match — try to find by URI (handles entries without a resolved DID)
    if (!entry.did) {
      const existing = this.byUri.get(entry.uri)
      if (existing) {
        const merged = mergeEntries(existing, entry)
        this.byUri.set(entry.uri, merged)
        if (merged.did) this.byDid.set(merged.did, merged)
        return
      }
    }
    if (entry.did) this.byDid.set(entry.did, entry)
    this.byUri.set(entry.uri, entry)
  }

  toArray(): StewardEntry[] {
    const seen = new Set<StewardEntry>()
    for (const e of this.byDid.values()) seen.add(e)
    for (const e of this.byUri.values()) seen.add(e)
    return [...seen]
  }
}

/**
 * Merges multiple StewardEntry lists into a single deduplicated list.
 * Dedup key: resolved DID. Entries sharing a DID have their tags unioned.
 */
export function mergeIntoEntries(
  ...entryLists: StewardEntry[][]
): StewardEntry[] {
  const index = new EntryIndex()

  for (const list of entryLists) {
    for (const e of list) index.upsert(e)
  }

  return index.toArray()
}

/**
 * Same as mergeIntoEntries but for dependency-only stewards (referencedStewards).
 * These are always tool-tagged and never merged with follows.
 */
export function referencedStewardsToEntries(
  stewards: StewardEntry[],
): StewardEntry[] {
  return stewards
}
