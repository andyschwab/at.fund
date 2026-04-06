import { Client } from '@atproto/lex'
import type { AtIdentifierString } from '@atproto/lex-client'
import * as fund from '@/lexicons/fund'
import { resolveDidFromIdentifier, resolvePdsUrl } from '@/lib/fund-at-records'

/**
 * Fetches a user's endorse records publicly, no auth required.
 * Tries new NSID (fund.at.graph.endorse) first, falls back to legacy (fund.at.endorse).
 * Returns the list of endorsed URIs (DIDs / hostnames).
 */
export async function fetchPublicEndorsements(handle: string): Promise<string[]> {
  const did = await resolveDidFromIdentifier(handle)
  if (!did) return []
  const pdsUrl = await resolvePdsUrl(did)
  if (!pdsUrl) return []
  const client = new Client(pdsUrl.origin)
  const repo = did as AtIdentifierString

  // Try new NSID first
  try {
    const res = await client.list(fund.at.graph.endorse, { repo, limit: 100 })
    const uris = res.records
      .map((r) => {
        const val = r.value as Record<string, unknown>
        const subject = (val.subject ?? val.uri) as string | undefined
        return typeof subject === 'string' ? subject.trim() : ''
      })
      .filter(Boolean)
    if (uris.length > 0) return uris
  } catch { /* fall through to legacy */ }

  // Fall back to legacy NSID
  try {
    const res = await client.list(fund.at.endorse, { repo, limit: 100 })
    return res.records
      .map((r) => (typeof r.value.uri === 'string' ? r.value.uri.trim() : ''))
      .filter(Boolean)
  } catch {
    return []
  }
}
