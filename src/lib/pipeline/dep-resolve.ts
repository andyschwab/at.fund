import type { StewardEntry } from '@/lib/steward-model'
import { buildIdentity, batchFetchProfiles, resolveRefToDid } from '@/lib/identity'
import { resolveFundingForDep } from '@/lib/funding'
import type { ScanContext } from '@/lib/scan-context'

// ---------------------------------------------------------------------------
// Phase 4: Resolve referenced dependency entries (multi-level)
// ---------------------------------------------------------------------------

/**
 * For all dependency URIs referenced by entries, resolve display info from
 * fund.at records and the manual catalog, and fetch profiles for avatars.
 * Resolves multiple levels deep so the client can determine correct icon
 * colors (a dep whose sub-dep has a contribute URL shows amber instead of grey).
 *
 * These "referenced entries" power the dependency drill-down modal and
 * the inline dependency row icons.
 */
export async function resolveDependencies(
  entries: StewardEntry[],
  onReferenced?: (entry: StewardEntry) => void,
  ctx?: ScanContext,
): Promise<StewardEntry[]> {
  const knownUris = new Set<string>()
  for (const e of entries) {
    knownUris.add(e.uri)
    if (e.did) knownUris.add(e.did)
  }

  const referenced: StewardEntry[] = []
  const resolved = new Set<string>()

  // Seed the queue with deps from primary entries
  const queue: string[] = []
  for (const entry of entries) {
    for (const depUri of entry.dependencies ?? []) {
      if (!knownUris.has(depUri)) queue.push(depUri)
    }
  }

  // Process the queue, adding sub-deps as we discover them
  while (queue.length > 0) {
    const depUri = queue.shift()!
    if (resolved.has(depUri) || knownUris.has(depUri)) continue
    resolved.add(depUri)

    const refEntry = await resolveDepEntry(depUri, ctx)
    referenced.push(refEntry)
    onReferenced?.(refEntry)

    // Enqueue sub-deps for next-level resolution
    for (const subDep of refEntry.dependencies ?? []) {
      if (!resolved.has(subDep) && !knownUris.has(subDep)) {
        queue.push(subDep)
      }
    }
  }

  // Batch-fetch profiles for all referenced entries that have a DID but no avatar
  await backfillProfiles(referenced)

  // Re-emit entries that got updated with profile data
  if (onReferenced) {
    for (const entry of referenced) {
      if (entry.avatar || entry.handle) {
        onReferenced(entry)
      }
    }
  }

  return referenced
}

// ---------------------------------------------------------------------------
// Single dependency resolution: identity + funding
// ---------------------------------------------------------------------------

async function resolveDepEntry(
  depUri: string,
  ctx?: ScanContext,
): Promise<StewardEntry> {
  const did = await resolveRefToDid(depUri)

  const identity = buildIdentity({
    ref: depUri,
    did,
    // Hostname refs are tools: preserves the hostname as the canonical URI so
    // that lookup(depUri) in DependenciesSection finds the entry. Without this,
    // buildIdentity falls through to uri = did, which doesn't match the hostname
    // stored in entry.dependencies.
    isTool: !depUri.startsWith('did:'),
    // No profile data yet — backfillProfiles handles that later
  })

  const funding = await resolveFundingForDep(identity, ctx)

  return { ...identity, ...funding, tags: ['dependency'] }
}

// ---------------------------------------------------------------------------
// Profile backfill for dependency entries
// ---------------------------------------------------------------------------

async function backfillProfiles(entries: StewardEntry[]): Promise<void> {
  const needsProfile = entries.filter((e) => e.did && !e.avatar)
  if (needsProfile.length === 0) return

  const dids = needsProfile.map((e) => e.did!)
  const profileMap = await batchFetchProfiles(dids)

  for (const entry of needsProfile) {
    const p = profileMap.get(entry.did!)
    if (!p) continue
    if (p.avatar) entry.avatar = p.avatar
    if (p.handle && !entry.handle) entry.handle = p.handle
    if (p.displayName && entry.displayName === entry.uri) {
      entry.displayName = p.displayName
    }
    if (p.description && !entry.description) entry.description = p.description
    if (p.handle && !entry.landingPage) {
      entry.landingPage = `https://bsky.app/profile/${p.handle}`
    }
  }
}
