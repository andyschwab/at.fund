import type { StewardCardModel, StewardEntry, StewardSource, StewardTag } from '@/lib/steward-model'
import type { FollowedAccountCard } from '@/lib/follow-scan'

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
// Convert legacy types to StewardEntry
// ---------------------------------------------------------------------------

function stewardCardToEntry(card: StewardCardModel, tag: StewardTag): StewardEntry {
  const { stewardUri, stewardDid, displayName, description, landingPage,
          links, dependencies, dependencyNotes, source, ...extras } = card as StewardCardModel & { dependencyNotes?: string }
  return {
    uri: stewardUri,
    did: stewardDid,
    tags: [tag],
    displayName,
    description,
    landingPage,
    links,
    dependencies,
    dependencyNotes,
    source,
    ...extras,
  }
}

function followedAccountToEntry(account: FollowedAccountCard): StewardEntry {
  return {
    uri: account.handle ?? account.did,
    did: account.did,
    handle: account.handle,
    tags: ['follow'],
    displayName: account.displayName ?? account.handle ?? account.did,
    description: account.description,
    landingPage: account.landingPage,
    links: account.links,
    source: 'fund.at',
  }
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

  // Union links by URL
  const linkMap = new Map<string, { label: string; url: string }>()
  for (const l of [...(base.links ?? []), ...(incoming.links ?? [])]) {
    linkMap.set(l.url, l)
  }
  const links = linkMap.size > 0 ? [...linkMap.values()] : undefined

  // Union dependencies
  const depSet = new Set([...(base.dependencies ?? []), ...(incoming.dependencies ?? [])])
  const dependencies = depSet.size > 0 ? [...depSet].sort() : undefined

  // Prefer hostname URI over DID for readability
  const uri = (!base.uri.startsWith('did:') ? base.uri : null)
    ?? (!incoming.uri.startsWith('did:') ? incoming.uri : null)
    ?? base.uri

  return {
    ...other,
    ...preferred,
    uri,
    did: base.did ?? incoming.did,
    handle: base.handle ?? incoming.handle,
    tags,
    source,
    displayName: preferred.displayName ?? other.displayName,
    description: preferred.description ?? other.description,
    landingPage: preferred.landingPage ?? other.landingPage,
    links,
    dependencies,
    dependencyNotes: preferred.dependencyNotes ?? other.dependencyNotes,
  }
}

// ---------------------------------------------------------------------------
// Public: merge stewards + follows into a unified, deduped StewardEntry[]
// ---------------------------------------------------------------------------

/**
 * Merges tool stewards (StewardCardModel[]) and followed accounts
 * (FollowedAccountCard[]) into a single deduplicated StewardEntry[].
 * Dedup key: resolved DID. Entries sharing a DID have their tags unioned.
 */
export function mergeIntoEntries(
  stewards: StewardCardModel[],
  followedAccounts: FollowedAccountCard[],
): StewardEntry[] {
  const byDid = new Map<string, StewardEntry>()
  const byUri = new Map<string, StewardEntry>()

  function upsert(entry: StewardEntry) {
    // Try to merge with an existing entry that shares the same DID
    if (entry.did) {
      const existing = byDid.get(entry.did)
      if (existing) {
        const merged = mergeEntries(existing, entry)
        byDid.set(entry.did, merged)
        // Keep byUri in sync: update any uri key that points to this entry
        if (byUri.get(existing.uri) === existing) byUri.set(existing.uri, merged)
        if (merged.uri !== existing.uri) byUri.set(merged.uri, merged)
        return
      }
    }
    // No DID match — try to find by URI (handles entries without a resolved DID)
    if (!entry.did) {
      const existing = byUri.get(entry.uri)
      if (existing) {
        const merged = mergeEntries(existing, entry)
        byUri.set(entry.uri, merged)
        if (merged.did) byDid.set(merged.did, merged)
        return
      }
    }
    // New entry
    if (entry.did) byDid.set(entry.did, entry)
    byUri.set(entry.uri, entry)
  }

  for (const s of stewards) {
    upsert(stewardCardToEntry(s, 'tool'))
  }
  for (const f of followedAccounts) {
    upsert(followedAccountToEntry(f))
  }

  // Collect unique entries (byDid is authoritative for DID entries; byUri covers the rest)
  const seen = new Set<StewardEntry>()
  for (const e of byDid.values()) seen.add(e)
  for (const e of byUri.values()) seen.add(e)

  return [...seen]
}

/**
 * Same as mergeIntoEntries but for dependency-only stewards (referencedStewards).
 * These are always tool-tagged and never merged with follows.
 */
export function referencedStewardsToEntries(
  stewards: StewardCardModel[],
): StewardEntry[] {
  return stewards.map((s) => stewardCardToEntry(s, 'tool'))
}
