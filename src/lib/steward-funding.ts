import { fetchFundAtRecords } from '@/lib/fund-at-records'
import type { FundLink, DisclosureMeta } from '@/lib/fund-at-records'

export type { FundLink }

export type StewardFundAt = {
  stewardDid: string
  links?: FundLink[]
  dependencyUris?: string[]
  disclosure: DisclosureMeta
}

/**
 * Fetches fund.at.* records for a steward DID (no domain scoping).
 * Returns null if the steward does not publish disclosure metadata.
 */
export async function fetchFundAtForStewardDid(
  stewardDid: string,
): Promise<StewardFundAt | null> {
  const result = await fetchFundAtRecords(stewardDid)
  if (!result) return null
  return { stewardDid, ...result }
}
