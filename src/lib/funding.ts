import type { OAuthSession } from '@atproto/oauth-client'
import type { Identity, Funding } from '@/lib/steward-model'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { fetchOwnFundAtRecords, fetchFundAtRecords } from '@/lib/fund-at-records'
import type { ScanContext } from '@/lib/scan-context'
import { logger } from '@/lib/logger'
import { mergeDeps } from '@/lib/merge-deps'

// ---------------------------------------------------------------------------
// Manual catalog lookup by identity keys
// ---------------------------------------------------------------------------

/**
 * Tries the manual catalog by DID (using the catalog's DID reverse index),
 * then by extra keys (e.g. tool hostnames from the gather phase).
 *
 * The DID reverse index in catalog.ts means DID lookups find hostname-keyed
 * entries natively, so extraKeys is only needed for edge cases where the
 * catalog key differs from both the DID and its indexed hostname.
 */
export function lookupManualByIdentity(
  identity: Identity,
  extraKeys?: string[],
) {
  const r = lookupManualStewardRecord(identity.did)
  if (r) return r
  for (const key of extraKeys ?? []) {
    const r = lookupManualStewardRecord(key)
    if (r) return r
  }
  return null
}

// ---------------------------------------------------------------------------
// Resolve funding — canonical fund.at → manual catalog → unknown chain
// ---------------------------------------------------------------------------

export type ResolveFundingOptions = {
  /** If provided, uses authenticated fetch for the user's own records. */
  session?: OAuthSession
  /** Additional catalog keys (e.g. tool hostnames from gather phase). */
  extraCatalogKeys?: string[]
  /** Scan context with prefetched fund.at promises — avoids redundant fetches. */
  ctx?: ScanContext
}

export type ResolveFundingResult = {
  funding: Funding
  warning?: { step: string; message: string }
}

/**
 * Resolves funding info for an identity using the canonical chain:
 *   1. fund.at records (from the identity's PDS)
 *   2. Manual catalog (by DID, URI, handle, or extra keys)
 *   3. Unknown fallback
 *
 * When the identity's DID matches the session DID, uses the authenticated
 * path to read the user's own records.
 *
 * Returns both the funding result and an optional warning (e.g. PDS unreachable).
 */
export async function resolveFunding(
  identity: Identity,
  options?: ResolveFundingOptions,
): Promise<ResolveFundingResult> {
  // 1. Try fund.at records (DID is always present)
  try {
    let fundAt
    if (options?.session && identity.did === options.session.did) {
      const own = await fetchOwnFundAtRecords(options.session)
      fundAt = own ? { stewardDid: identity.did, ...own } : null
    } else if (options?.ctx?.fundAtPrefetch.has(identity.did)) {
      const result = await options.ctx.fundAtPrefetch.get(identity.did)!
      fundAt = result ? { stewardDid: identity.did, ...result } : null
    } else {
      fundAt = await fetchFundAtForStewardDid(identity.did)
    }
    if (fundAt) {
      const manual = lookupManualByIdentity(identity, options?.extraCatalogKeys)
      return {
        funding: {
          source: 'fund.at',
          contributeUrl: fundAt.contributeUrl ?? manual?.contributeUrl,
          dependencies: mergeDeps(
            fundAt.dependencies?.map((d) => d.uri),
            manual?.dependencies,
          ),
          channels: fundAt.channels,
          plans: fundAt.plans,
        },
      }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'fund.at fetch failed'
    logger.warn('funding: fund.at fetch failed', {
      did: identity.did,
      error: message,
    })
    return {
      ...(await resolveFundingFallback(identity, options?.extraCatalogKeys)),
      warning: { step: 'fund-at-fetch', message },
    }
  }

  // 2–3. Manual catalog or unknown
  return resolveFundingFallback(identity, options?.extraCatalogKeys)
}

/**
 * Resolves funding for a dependency entry (no auth, uses public fetchFundAtRecords).
 * Same chain as resolveFunding but without the session/own-records branch.
 */
export async function resolveFundingForDep(
  identity: Identity,
  ctx?: ScanContext,
): Promise<Funding> {
  try {
    let fundAt
    if (ctx?.fundAtPrefetch.has(identity.did)) {
      fundAt = await ctx.fundAtPrefetch.get(identity.did)!
    } else {
      fundAt = await fetchFundAtRecords(identity.did)
    }
    if (fundAt) {
      const manual = lookupManualByIdentity(identity)
      return {
        source: 'fund.at',
        contributeUrl: fundAt.contributeUrl ?? manual?.contributeUrl,
        dependencies: mergeDeps(
          fundAt.dependencies?.map((d) => d.uri),
          manual?.dependencies,
        ),
        channels: fundAt.channels,
        plans: fundAt.plans,
      }
    }
  } catch (e) {
    logger.warn('funding: dep fund.at fetch failed', {
      did: identity.did,
      error: e instanceof Error ? e.message : String(e),
    })
  }

  return (await resolveFundingFallback(identity)).funding
}

// ---------------------------------------------------------------------------
// Internal fallback: manual catalog → unknown
// ---------------------------------------------------------------------------

async function resolveFundingFallback(
  identity: Identity,
  extraKeys?: string[],
): Promise<ResolveFundingResult> {
  const manual = lookupManualByIdentity(identity, extraKeys)
  if (manual) {
    return {
      funding: {
        source: 'manual',
        contributeUrl: manual.contributeUrl,
        dependencies: manual.dependencies,
      },
    }
  }
  return { funding: { source: 'unknown' } }
}
