import { Client } from '@atproto/lex'
import type { AtIdentifierString } from '@atproto/lex-client'
import * as fund from '@/lexicons/fund'
import { resolveDidFromIdentifier, resolvePdsUrl } from '@/lib/fund-at-records'

/**
 * Fetches a user's fund.at.endorse records publicly, no auth required.
 * Returns the list of endorsed URIs (DIDs / hostnames).
 */
export async function fetchPublicEndorsements(handle: string): Promise<string[]> {
  const did = await resolveDidFromIdentifier(handle)
  if (!did) return []
  const pdsUrl = await resolvePdsUrl(did)
  if (!pdsUrl) return []
  const client = new Client(pdsUrl.origin)
  try {
    const res = await client.list(fund.at.endorse, {
      repo: did as AtIdentifierString,
      limit: 100,
    })
    return res.records
      .map((r) => (typeof r.value.uri === 'string' ? r.value.uri.trim() : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}
