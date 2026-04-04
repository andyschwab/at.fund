import { Client } from '@atproto/lex'
import type { Identity, ProfileData } from '@/lib/steward-model'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveDidFromIdentifier } from '@/lib/fund-at-records'
import { xrpcQuery } from '@/lib/xrpc'
import { logger } from '@/lib/logger'
import { PUBLIC_API, PROFILE_BATCH } from '@/lib/constants'

export type { ProfileData }

// ---------------------------------------------------------------------------
// Display name heuristic — canonical "is this human-readable?" check
// ---------------------------------------------------------------------------

/** Returns true when `name` is a non-empty string that doesn't look like a DID. */
export function isHumanReadableName(name: string | undefined | null): name is string {
  if (!name) return false
  return !name.startsWith('did:')
}

// ---------------------------------------------------------------------------
// Build Identity — pure function applying canonical display rules
// ---------------------------------------------------------------------------

export type BuildIdentityInput = {
  /** Original identifier — hostname, handle, or DID. */
  ref: string
  did?: string
  handle?: string
  displayName?: string
  description?: string
  avatar?: string
  /**
   * Whether this entity was discovered as a tool (via repo collections).
   * Tools use hostname as URI; non-tools get a bsky profile landing page.
   */
  isTool?: boolean
}

/**
 * Assembles an Identity from resolved data, applying canonical rules for
 * URI preference, display name, and landing page.
 *
 * Pure — no network calls.
 */
export function buildIdentity(input: BuildIdentityInput): Identity {
  const { ref, did, handle, description, avatar, isTool } = input
  const hostname = isTool && !ref.startsWith('did:') ? ref : undefined

  // URI preference: hostname > handle > DID > raw ref
  const uri = hostname ?? handle ?? did ?? ref

  // Display name: profile name (if human-readable) > hostname > handle > raw ref
  const displayName = isHumanReadableName(input.displayName)
    ? input.displayName
    : hostname ?? handle ?? ref

  // Landing page: non-tools with a handle get a bsky profile link
  const landingPage = !isTool && handle
    ? `https://bsky.app/profile/${handle}`
    : undefined

  return { uri, did, handle, displayName, description, avatar, landingPage }
}

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
