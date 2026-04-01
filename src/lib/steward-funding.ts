import type { Client } from '@atproto/lex'
import { fetchFundAtRecords } from '@/lib/fund-at-records'
import type { FundLink, DisclosureMeta } from '@/lib/fund-at-records'

export type { FundLink }

export type StewardFundAt = {
  stewardDid: string
  links?: FundLink[]
  dependencyUris?: string[]
  dependencyNotes?: string
  disclosure: DisclosureMeta
}

/**
 * Fetches fund.at.* records for a steward DID (no domain scoping).
 * Returns null if the steward does not publish disclosure metadata.
 */
export async function fetchFundAtForStewardDid(
  stewardDid: string,
  client?: Client,
): Promise<StewardFundAt | null> {
  const result = await fetchFundAtRecords(stewardDid, undefined, client)
  if (!result) return null
  return { stewardDid, ...result }
}
