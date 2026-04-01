import type { StewardEntry } from '@/lib/steward-model'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { Client } from '@atproto/lex'
import { xrpcQuery } from '@/lib/xrpc'

// ---------------------------------------------------------------------------
// Phase 4: Resolve referenced dependency entries (multi-level)
// ---------------------------------------------------------------------------

const PUBLIC_API = 'https://public.api.bsky.app'
const PROFILE_BATCH = 25

/**
 * For all dependency URIs referenced by entries, resolve display info from
 * the manual catalog. Resolves multiple levels deep so the client can
 * determine correct icon colors (a dep whose sub-dep has a contribute URL
 * shows amber instead of grey).
 *
 * DID-based deps are additionally enriched with Bluesky profile data
 * (handle + displayName) using the public API — no auth required.
 *
 * These "referenced entries" power the dependency drill-down modal and
 * the inline dependency row icons.
 */
export async function resolveDependencies(
  entries: StewardEntry[],
  onReferenced?: (entry: StewardEntry) => void,
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

    const manual = lookupManualStewardRecord(depUri)
    const refEntry: StewardEntry = {
      uri: depUri,
      tags: ['tool'],
      displayName: depUri,
      source: manual ? 'manual' : 'unknown',
      contributeUrl: manual?.contributeUrl,
      dependencies: manual?.dependencies,
    }
    referenced.push(refEntry)

    // Enqueue sub-deps for next-level resolution
    for (const subDep of manual?.dependencies ?? []) {
      if (!resolved.has(subDep) && !knownUris.has(subDep)) {
        queue.push(subDep)
      }
    }
  }

  // Enrich DID-based deps with Bluesky profile data (public API, no auth needed)
  const didEntries = referenced.filter((e) => e.uri.startsWith('did:'))
  if (didEntries.length > 0) {
    const publicClient = new Client(PUBLIC_API)
    for (let i = 0; i < didEntries.length; i += PROFILE_BATCH) {
      const batch = didEntries.slice(i, i + PROFILE_BATCH)
      try {
        const data = await xrpcQuery<{
          profiles?: Array<{ did: string; handle?: string; displayName?: string }>
        }>(publicClient, 'app.bsky.actor.getProfiles', { actors: batch.map((e) => e.uri) })
        for (const profile of data.profiles ?? []) {
          const entry = batch.find((e) => e.uri === profile.did)
          if (!entry) continue
          if (profile.handle) entry.handle = profile.handle
          const name = profile.displayName && !profile.displayName.startsWith('did:')
            ? profile.displayName
            : profile.handle
          if (name) entry.displayName = name
        }
      } catch { /* profile enrichment is best-effort */ }
    }
  }

  // Emit after enrichment so clients receive fully resolved entries
  for (const entry of referenced) {
    onReferenced?.(entry)
  }

  return referenced
}
