import { Agent } from '@atproto/api'
import { extractPdsUrl } from '@atproto/did'
import type { AtprotoDidDocument } from '@atproto/did'
import type { OAuthSession } from '@atproto/oauth-client'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveStewardUri, lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { fetchOwnFundAtRecords } from '@/lib/fund-at-records'

import type { StewardCardModel } from '@/lib/steward-model'
import { scanFollows } from '@/lib/follow-scan'
import type { FollowedAccountCard } from '@/lib/follow-scan'
import {
  getBlueskyHandleFallback,
  handleFromDescribeRepo,
} from '@/lib/auth/session-handle'
import { filterThirdPartyCollections } from '@/lib/repo-inspect'
import {
  resolveCalendarCatalogKeys,
  resolveSiteStandardPairs,
  stripDerivedCollections,
} from '@/lib/repo-collection-resolve'
import { logger } from '@/lib/logger'

/**
 * OAuth requests use the token `aud` (resource server) as the PDS base URL.
 * `extractPdsUrl(didDoc)` can fail on some documents; `aud` matches the live
 * connection and should always be present for an OAuth session.
 */
async function resolveSessionPdsUrl(
  session: OAuthSession,
  agent: Agent,
): Promise<URL | null> {
  try {
    const info = await session.getTokenInfo(false)
    const raw = info.aud?.trim()
    if (raw && /^https?:\/\//i.test(raw)) {
      return new URL(raw)
    }
  } catch {
    // ignore
  }
  try {
    const resolved = await agent.com.atproto.identity.resolveIdentity({
      identifier: session.did,
    })
    return extractPdsUrl(resolved.data.didDoc as AtprotoDidDocument)
  } catch {
    return null
  }
}

export type { PdsHostFunding }
export type { FollowedAccountCard }

export type ScanWarning = {
  stewardUri: string
  step: string
  message: string
}

export type ScanResult = {
  did: string
  handle?: string
  pdsUrl?: string
  stewards: StewardCardModel[]
  /** Resolved models for dependency URIs not in stewards — used for lookup only, not rendered as cards. */
  referencedStewards: StewardCardModel[]
  followedAccounts: FollowedAccountCard[]
  warnings: ScanWarning[]
  pdsHostFunding?: PdsHostFunding
}

export async function scanRepo(
  session: OAuthSession,
  selfReportedStewards: string[] = [],
): Promise<ScanResult> {
  const agent = new Agent(session)

  const pdsUrl = await resolveSessionPdsUrl(session, agent)

  const repoInfo = await agent.com.atproto.repo.describeRepo({
    repo: session.did,
  })
  const collections = repoInfo.data.collections ?? []

  const handle =
    handleFromDescribeRepo(repoInfo.data) ??
    (await getBlueskyHandleFallback(session))

  const thirdParty = filterThirdPartyCollections(collections)
  const staticCols = stripDerivedCollections(thirdParty)
  const calendarKeys = await resolveCalendarCatalogKeys(
    agent,
    session.did,
    thirdParty,
  )
  const siteStandardPairs = await resolveSiteStandardPairs(
    agent,
    session.did,
    thirdParty,
  )

  const observed = new Set<string>()
  for (const c of staticCols) observed.add(c)
  for (const k of calendarKeys) observed.add(k)
  for (const pair of siteStandardPairs) observed.add(pair.contentType)
  for (const s of selfReportedStewards) observed.add(s)

  const stewardUris = new Set<string>()
  for (const key of observed) {
    const resolved = resolveStewardUri(key)
    if (resolved) stewardUris.add(resolved)
  }

  logger.info('scan: resolved steward URIs', {
    did: session.did,
    stewardCount: stewardUris.size,
    stewardUris: [...stewardUris].sort(),
  })

  const stewards: StewardCardModel[] = []
  const warnings: ScanWarning[] = []

  for (const stewardUri of [...stewardUris].sort((a, b) => a.localeCompare(b))) {
    const isDid = stewardUri.startsWith('did:')
    let stewardDid: string | null = null

    if (isDid) {
      stewardDid = stewardUri
    } else {
      try {
        stewardDid = await lookupAtprotoDid(stewardUri)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'DNS lookup failed'
        logger.warn('scan: DNS lookup failed for steward', { stewardUri, error: msg })
        warnings.push({ stewardUri, step: 'dns-lookup', message: msg })
      }
    }

    const stewardDidOrUndefined = stewardDid ?? undefined
    const manual = lookupManualStewardRecord(stewardUri)

    if (stewardDid) {
      try {
        let fundAt
        if (stewardDid === session.did) {
          const ownRecords = await fetchOwnFundAtRecords(session)
          fundAt = ownRecords ? { stewardDid, ...ownRecords } : null
        } else {
          fundAt = await fetchFundAtForStewardDid(stewardDid, agent)
        }
        if (fundAt) {
          const {
            displayName: dName,
            description: dDesc,
            landingPage: dLanding,
            ...disclosureExtras
          } = fundAt.disclosure
          stewards.push({
            stewardUri,
            stewardDid: stewardDidOrUndefined,
            displayName: dName ?? manual?.displayName ?? stewardUri,
            description: dDesc ?? manual?.description,
            landingPage: dLanding,
            links: fundAt.links,
            dependencies: fundAt.dependencyUris,
            source: 'fund.at',
            ...disclosureExtras,
            contactGeneralHandle:
              fundAt.disclosure.contactGeneralHandle ??
              manual?.contactGeneralHandle,
          })
          continue
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch fund.at records'
        logger.warn('scan: fund.at fetch failed for steward', {
          stewardUri,
          stewardDid,
          error: msg,
        })
        warnings.push({ stewardUri, step: 'fund-at-fetch', message: msg })
        // Fall through to manual catalog
      }
    }

    if (manual) {
      stewards.push({
        stewardUri,
        stewardDid: stewardDidOrUndefined,
        displayName: manual.displayName,
        description: manual.description,
        landingPage: manual.landingPage,
        contactGeneralHandle: manual.contactGeneralHandle,
        links: manual.links.length > 0 ? manual.links : undefined,
        dependencies: manual.dependencies,
        source: 'manual',
      })
      continue
    }

    stewards.push({
      stewardUri,
      stewardDid: stewardDidOrUndefined,
      displayName: stewardUri,
      source: 'unknown',
    })
  }

  // Resolve dep URIs that weren't in the main scan (catalog-only, no extra network calls).
  // These are needed so the UI can determine whether a steward's deps accept contributions.
  const referencedStewards: StewardCardModel[] = []
  const resolvedDepUris = new Set<string>()
  for (const s of stewards) {
    for (const depUri of s.dependencies ?? []) {
      if (!stewardUris.has(depUri) && !resolvedDepUris.has(depUri)) {
        resolvedDepUris.add(depUri)
        const manual = lookupManualStewardRecord(depUri)
        if (manual) {
          referencedStewards.push({
            stewardUri: depUri,
            displayName: manual.displayName,
            description: manual.description,
            landingPage: manual.landingPage,
            contactGeneralHandle: manual.contactGeneralHandle,
            links: manual.links.length > 0 ? manual.links : undefined,
            dependencies: manual.dependencies,
            source: 'manual',
          })
        }
      }
    }
  }

  /** Sort: direct (has contribute link) → dependency (has deps, no link) → none → unknown */
  function stewardTier(s: StewardCardModel): number {
    if (s.source === 'unknown') return 3
    if (s.links && s.links.length > 0) return 0
    if (s.dependencies && s.dependencies.length > 0) return 1
    return 2
  }
  stewards.sort((a, b) => {
    const diff = stewardTier(a) - stewardTier(b)
    if (diff !== 0) return diff
    return a.stewardUri.localeCompare(b.stewardUri)
  })

  // Run PDS host funding and follow scan in parallel
  let pdsHostFunding: ScanResult['pdsHostFunding']
  let followedAccounts: FollowedAccountCard[] = []

  const pdsHostPromise = (async () => {
    if (!pdsUrl) return
    try {
      pdsHostFunding = (await fetchFundingForUriLike(pdsUrl.origin, agent)) ?? undefined
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDS host funding lookup failed'
      logger.warn('scan: PDS host funding lookup failed', {
        pdsUrl: pdsUrl.origin,
        error: msg,
      })
      warnings.push({ stewardUri: pdsUrl.origin, step: 'pds-host-funding', message: msg })
    }
  })()

  const followsPromise = (async () => {
    try {
      followedAccounts = await scanFollows(session.did, agent)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Follow scan failed'
      logger.warn('scan: follow scan failed', { did: session.did, error: msg })
      warnings.push({ stewardUri: session.did, step: 'follow-scan', message: msg })
    }
  })()

  await Promise.all([pdsHostPromise, followsPromise])

  logger.info('scan: completed', {
    did: session.did,
    stewardCount: stewards.length,
    warningCount: warnings.length,
    sources: {
      fundAt: stewards.filter((s) => s.source === 'fund.at').length,
      manual: stewards.filter((s) => s.source === 'manual').length,
      unknown: stewards.filter((s) => s.source === 'unknown').length,
    },
  })

  return {
    did: session.did,
    handle,
    pdsUrl: pdsUrl?.origin,
    stewards,
    referencedStewards,
    followedAccounts,
    warnings,
    pdsHostFunding,
  }
}
