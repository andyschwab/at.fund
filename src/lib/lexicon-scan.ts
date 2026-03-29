import { Agent } from '@atproto/api'
import type { OAuthSession } from '@atproto/oauth-client'
import {
  buildRows,
  groupRowsByApp,
  type AppProjectGroup,
} from '@/lib/funding'
import { filterThirdPartyCollections } from '@/lib/repo-inspect'

export type ScanResult = {
  did: string
  handle?: string
  repoCollectionCount: number
  appGroups: AppProjectGroup[]
}

export async function scanRepo(
  session: OAuthSession,
  selfReportedNsids: string[] = [],
): Promise<ScanResult> {
  const agent = new Agent(session)

  const res = await agent.com.atproto.repo.describeRepo({ repo: session.did })
  const collections = res.data.collections ?? []

  let handle: string | undefined
  try {
    const prof = await agent.app.bsky.actor.getProfile({
      actor: session.did,
    })
    handle = prof.data.handle
  } catch {
    // profile optional
  }

  const thirdParty = filterThirdPartyCollections(collections)
  const rows = buildRows(thirdParty, selfReportedNsids)
  const appGroups = groupRowsByApp(rows)

  return {
    did: session.did,
    handle,
    repoCollectionCount: collections.length,
    appGroups,
  }
}
