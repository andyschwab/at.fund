import type { Client } from '@atproto/lex'
import { fetchFundAtRecords } from '@/lib/fund-at-records'

export type PdsHostFunding = {
  pdsHostname: string
  stewardDid: string
  pdsStewardUri?: string
  pdsStewardHandle?: string
  contributeUrl?: string
  dependencies?: Array<{ uri: string; label?: string }>
}

/**
 * Fetches fund.at.* records for a steward DID scoped to a PDS hostname.
 * Returns null when no fund.at records exist.
 */
export async function fetchPdsHostFunding(
  stewardDid: string,
  pdsHostname: string,
  opts?: {
    pdsStewardUri?: string
    pdsStewardHandle?: string
  },
  client?: Client,
): Promise<PdsHostFunding | null> {
  const result = await fetchFundAtRecords(stewardDid, client)
  if (!result) return null
  return { pdsHostname, stewardDid, ...opts, ...result }
}
