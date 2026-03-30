import { Agent } from '@atproto/api'
import { extractPdsUrl } from '@atproto/did'
import type { AtprotoDidDocument } from '@atproto/did'
import type { OAuthSession } from '@atproto/oauth-client'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveStewardUri, lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import type { StewardCardModel } from '@/lib/steward-model'
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
        const fundAt = await fetchFundAtForStewardDid(stewardDid)
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

  /** Donation / contribute links first among known stewards; unknown entries stay last. */
  stewards.sort((a, b) => {
    const aUnknown = a.source === 'unknown'
    const bUnknown = b.source === 'unknown'
    if (aUnknown !== bUnknown) return aUnknown ? 1 : -1
    const aHasDonate = !!(a.links && a.links.length > 0)
    const bHasDonate = !!(b.links && b.links.length > 0)
    if (aHasDonate !== bHasDonate) return aHasDonate ? -1 : 1
    return a.stewardUri.localeCompare(b.stewardUri)
  })

  let pdsHostFunding: ScanResult['pdsHostFunding']
  if (pdsUrl) {
    try {
      pdsHostFunding = (await fetchFundingForUriLike(pdsUrl.origin)) ?? undefined
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDS host funding lookup failed'
      logger.warn('scan: PDS host funding lookup failed', {
        pdsUrl: pdsUrl.origin,
        error: msg,
      })
      warnings.push({ stewardUri: pdsUrl.origin, step: 'pds-host-funding', message: msg })
    }
  }

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
    warnings,
    pdsHostFunding,
  }
}
