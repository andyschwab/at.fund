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

export type { PdsHostFunding }

export type ScanResult = {
  did: string
  handle?: string
  /** Home PDS URL for the signed-in user (from DID document service discovery). */
  pdsUrl?: string
  repoCollectionCount: number
  stewards: StewardCardModel[]
  /** When the user’s PDS hostname resolves to a DID that publishes fund.at.* records. */
  pdsHostFunding?: PdsHostFunding
}

export async function scanRepo(
  session: OAuthSession,
  selfReportedStewards: string[] = [],
): Promise<ScanResult> {
  const agent = new Agent(session)

  let pdsUrl: URL | null = null
  try {
    const resolved = await agent.com.atproto.identity.resolveIdentity({
      identifier: session.did,
    })
    pdsUrl = extractPdsUrl(resolved.data.didDoc as AtprotoDidDocument)
  } catch {
    pdsUrl = null
  }

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

  const stewards: StewardCardModel[] = []
  for (const stewardUri of [...stewardUris].sort((a, b) => a.localeCompare(b))) {
    const isDid = stewardUri.startsWith('did:')
    const stewardDid: string | null = isDid
      ? stewardUri
      : await lookupAtprotoDid(stewardUri)
    const stewardDidOrUndefined = stewardDid ?? undefined

    if (stewardDid) {
      const fundAt = await fetchFundAtForStewardDid(stewardDid)
      if (fundAt) {
        stewards.push({
          stewardUri,
          stewardDid: stewardDidOrUndefined,
          displayName:
            fundAt.disclosure.displayName ?? lookupManualStewardRecord(stewardUri)?.displayName ?? stewardUri,
          description:
            fundAt.disclosure.description ??
            lookupManualStewardRecord(stewardUri)?.description,
          landingPage: fundAt.disclosure.landingPage,
          links: fundAt.links,
          dependencies: fundAt.dependencyUris,
          source: 'fund.at',
        })
        continue
      }
    }

    const manual =
      (stewardDid ? lookupManualStewardRecord(stewardDid) : null) ??
      lookupManualStewardRecord(stewardUri)
    if (manual) {
      stewards.push({
        stewardUri,
        stewardDid: stewardDidOrUndefined,
        displayName: manual.displayName,
        description: manual.description,
        landingPage: manual.landingPage,
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

  let pdsHostFunding: ScanResult['pdsHostFunding']
  if (pdsUrl) {
    pdsHostFunding = (await fetchFundingForUriLike(pdsUrl.origin)) ?? undefined
  }

  return {
    did: session.did,
    handle,
    pdsUrl: pdsUrl?.origin,
    repoCollectionCount: collections.length,
    stewards,
    pdsHostFunding,
  }
}
