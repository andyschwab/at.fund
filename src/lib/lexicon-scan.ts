import { Agent } from '@atproto/api'
import type { OAuthSession } from '@atproto/oauth-client'
import {
  fetchPdsHostFunding,
  type PdsHostFunding,
} from '@/lib/atfund-steward'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import {
  getBlueskyHandleFallback,
  handleFromDescribeRepo,
} from '@/lib/auth/session-handle'
import { getPdsHostnameFromSession } from '@/lib/session-pds'
import {
  buildRowsWithDerivatives,
  groupRowsByApp,
  type AppProjectGroup,
} from '@/lib/funding'
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
  repoCollectionCount: number
  appGroups: AppProjectGroup[]
  /** When the user’s PDS hostname resolves to a DID that publishes fund.at.* records. */
  pdsHostFunding?: PdsHostFunding
}

export async function scanRepo(
  session: OAuthSession,
  selfReportedNsids: string[] = [],
): Promise<ScanResult> {
  const agent = new Agent(session)

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
  const merged = [...new Set([...staticCols, ...calendarKeys])]
  const rows = buildRowsWithDerivatives(
    merged,
    siteStandardPairs,
    selfReportedNsids,
  )
  const appGroups = groupRowsByApp(rows)

  let pdsHostFunding: ScanResult['pdsHostFunding']
  const pdsHostname = await getPdsHostnameFromSession(session)
  if (pdsHostname) {
    const did = await lookupAtprotoDid(pdsHostname)
    if (did) {
      pdsHostFunding = (await fetchPdsHostFunding(did, pdsHostname)) ?? undefined
    }
  }

  return {
    did: session.did,
    handle,
    repoCollectionCount: collections.length,
    appGroups,
    pdsHostFunding,
  }
}
