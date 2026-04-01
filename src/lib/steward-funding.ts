import type { Client } from '@atproto/lex'
import { fetchFundAtRecords } from '@/lib/fund-at-records'
import type { FundAtResult } from '@/lib/fund-at-records'

export type StewardFundAt = {
  stewardDid: string
} & FundAtResult

/**
 * Fetches fund.at.* records for a steward DID.
 * Returns null if the steward does not publish any fund.at records.
 */
export async function fetchFundAtForStewardDid(
  stewardDid: string,
  client?: Client,
): Promise<StewardFundAt | null> {
  const result = await fetchFundAtRecords(stewardDid, client)
  if (!result) return null
  return { stewardDid, ...result }
}
