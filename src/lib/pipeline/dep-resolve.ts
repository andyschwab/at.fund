import { Client } from '@atproto/lex'
import type { StewardEntry } from '@/lib/steward-model'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtRecords, resolveDidFromIdentifier, resolveHandleFromDid } from '@/lib/fund-at-records'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { xrpcQuery } from '@/lib/xrpc'
import { logger } from '@/lib/logger'

const PUBLIC_API = 'https://public.api.bsky.app'
const PROFILE_BATCH = 25

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

    const refEntry = await resolveDepEntry(depUri)
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
// Single dependency resolution: DID + fund.at + manual catalog
// ---------------------------------------------------------------------------

async function resolveDepEntry(depUri: string): Promise<StewardEntry> {
  const manual = lookupManualStewardRecord(depUri)

  // Try to resolve URI to a DID
  const did = await resolveUriToDid(depUri)

  // Try fund.at records if we have a DID
  if (did) {
    try {
      const fundAt = await fetchFundAtRecords(did)
      if (fundAt) {
        const deps = mergeDeps(
          fundAt.dependencies?.map((d) => d.uri),
          manual?.dependencies,
        )
        return {
          uri: depUri,
          did,
          tags: ['dependency'],
          displayName: depUri,
          contributeUrl: fundAt.contributeUrl ?? manual?.contributeUrl,
          dependencies: deps,
          source: 'fund.at',
        }
      }
    } catch (e) {
      logger.warn('dep-resolve: fund.at fetch failed', {
        depUri, did, error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // Fall back to manual catalog
  return {
    uri: depUri,
    did,
    tags: ['dependency'],
    displayName: depUri,
    source: manual ? 'manual' : 'unknown',
    contributeUrl: manual?.contributeUrl,
    dependencies: manual?.dependencies,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveUriToDid(uri: string): Promise<string | undefined> {
  if (uri.startsWith('did:')) return uri

  // Try as a handle first
  try {
    const did = await resolveDidFromIdentifier(uri)
    if (did) return did
  } catch { /* not a handle */ }

  // Try DNS lookup for hostname
  try {
    const did = await lookupAtprotoDid(uri)
    if (did) return did
  } catch { /* not a hostname with atproto DNS */ }

  return undefined
}

async function backfillProfiles(entries: StewardEntry[]): Promise<void> {
  const needsProfile = entries.filter((e) => e.did && !e.avatar)
  if (needsProfile.length === 0) return

  const publicClient = new Client(PUBLIC_API)
  const dids = needsProfile.map((e) => e.did!)

  for (let i = 0; i < dids.length; i += PROFILE_BATCH) {
    const batch = dids.slice(i, i + PROFILE_BATCH)
    try {
      const data = await xrpcQuery<{
        profiles?: Array<{
          did: string
          handle?: string
          displayName?: string
          description?: string
          avatar?: string
        }>
      }>(publicClient, 'app.bsky.actor.getProfiles', { actors: batch })
      for (const p of data.profiles ?? []) {
        const entry = needsProfile.find((e) => e.did === p.did)
        if (!entry) continue
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
    } catch (e) {
      logger.warn('dep-resolve: profile batch failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
}

function mergeDeps(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined {
  if (!a && !b) return undefined
  const set = new Set([...(a ?? []), ...(b ?? [])])
  return set.size > 0 ? [...set].sort() : undefined
}
