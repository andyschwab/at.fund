import { Agent } from '@atproto/api'
import { fetchFundAtRecords } from '@/lib/fund-at-records'
import type { FundLink, DisclosureMeta } from '@/lib/fund-at-records'

export type { FundLink }

export type PdsHostFunding = {
  pdsHostname: string
  stewardDid: string
  pdsStewardUri?: string
  pdsStewardHandle?: string
  links?: FundLink[]
  dependencyUris?: string[]
  disclosure?: DisclosureMeta
}

/**
 * Fetches fund.at.* records for a steward DID, scoped to a PDS hostname
 * via restrictToDomains filtering. Returns null when no disclosure exists.
 */
export async function fetchPdsHostFunding(
  stewardDid: string,
  pdsHostname: string,
  opts?: {
    pdsStewardUri?: string
    pdsStewardHandle?: string
  },
  agent?: Agent,
): Promise<PdsHostFunding | null> {
  const result = await fetchFundAtRecords(stewardDid, pdsHostname, agent)
  if (!result) return null
  return { pdsHostname, stewardDid, ...opts, ...result }
}
