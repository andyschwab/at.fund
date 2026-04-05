import { Client } from '@atproto/lex'
import type { Identity, ProfileData } from '@/lib/steward-model'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveDidFromIdentifier } from '@/lib/fund-at-records'
import { xrpcQuery } from '@/lib/xrpc'
import { logger } from '@/lib/logger'
import { PUBLIC_API, PROFILE_BATCH } from '@/lib/constants'

// Re-export pure helpers from steward-model so existing imports still work.
export { isHumanReadableName, buildIdentity } from '@/lib/steward-model'
export type { BuildIdentityInput, ProfileData } from '@/lib/steward-model'

// ---------------------------------------------------------------------------
// Batch profile fetch
// ---------------------------------------------------------------------------

/**
 * Fetches profiles for a list of DIDs in batches.
 * Returns a Map keyed by DID for easy lookup.
 */
export async function batchFetchProfiles(
  dids: string[],
  client?: Client,
): Promise<Map<string, ProfileData>> {
  const publicClient = client ?? new Client(PUBLIC_API)
  const result = new Map<string, ProfileData>()

  for (let i = 0; i < dids.length; i += PROFILE_BATCH) {
    const batch = dids.slice(i, i + PROFILE_BATCH)
    try {
      const data = await xrpcQuery<{
        profiles?: ProfileData[]
      }>(publicClient, 'app.bsky.actor.getProfiles', { actors: batch })
      for (const p of data.profiles ?? []) {
        result.set(p.did, p)
      }
    } catch (e) {
      logger.warn('identity: profile batch failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// DID resolution — ref string -> DID
// ---------------------------------------------------------------------------

/**
 * Resolves a ref (handle, hostname, or DID) to a DID.
 * Tries handle resolution first, then DNS lookup.
 */
export async function resolveRefToDid(ref: string): Promise<string | undefined> {
  if (ref.startsWith('did:')) return ref

  // Try as a handle (resolveHandle API)
  try {
    const did = await resolveDidFromIdentifier(ref)
    if (did) return did
  } catch { /* not a handle */ }

  // Try DNS lookup for hostname
  try {
    const did = await lookupAtprotoDid(ref)
    if (did) return did
  } catch { /* not a hostname with atproto DNS */ }

  return undefined
}

// ---------------------------------------------------------------------------
// Full single-ref resolution (convenience)
// ---------------------------------------------------------------------------

/**
 * Resolves a single ref (DID, handle, or hostname) into a fully-populated
 * Identity with profile data. Convenience composition of resolveRefToDid +
 * batchFetchProfiles + buildIdentity.
 */
export async function resolveIdentity(
  ref: string,
  options?: { isTool?: boolean },
): Promise<Identity> {
  const { buildIdentity } = await import('@/lib/steward-model')
  const did = await resolveRefToDid(ref)

  let profile: ProfileData | undefined
  if (did) {
    const profiles = await batchFetchProfiles([did])
    profile = profiles.get(did)
  }

  return buildIdentity({
    ref,
    did,
    handle: profile?.handle,
    displayName: profile?.displayName,
    description: profile?.description,
    avatar: profile?.avatar,
    isTool: options?.isTool,
  })
}
