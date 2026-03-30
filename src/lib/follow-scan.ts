import { Agent } from '@atproto/api'
import type { FundLink } from '@/lib/fund-at-records'
import { logger } from '@/lib/logger'

const SLINGSHOT = 'https://slingshot.microcosm.blue'
const PUBLIC_API = 'https://public.api.bsky.app'
const FUND_DISCLOSURE = 'fund.at.disclosure'
const FUND_CONTRIBUTE = 'fund.at.contribute'
const CONCURRENCY = 10

export type FollowedAccountCard = {
  did: string
  handle?: string
  displayName?: string
  description?: string
  landingPage?: string
  links?: FundLink[]
}

type SlingshotRecord = {
  value: Record<string, unknown>
}

type MiniDoc = {
  did: string
  handle?: string
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function readLinks(value: Record<string, unknown>): FundLink[] {
  const raw = value.links
  if (!Array.isArray(raw)) return []
  const out: FundLink[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const label = (item as Record<string, unknown>).label
    const url = (item as Record<string, unknown>).url
    if (typeof label === 'string' && typeof url === 'string' && url.length > 0) {
      out.push({ label, url })
    }
  }
  return out
}

function readDisclosureMeta(value: Record<string, unknown>): {
  displayName?: string
  description?: string
  landingPage?: string
} {
  const meta = value.meta
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {}
  const m = meta as Record<string, unknown>
  return {
    displayName: typeof m.displayName === 'string' ? m.displayName : undefined,
    description: typeof m.description === 'string' ? m.description : undefined,
    landingPage: typeof m.landingPage === 'string' ? m.landingPage : undefined,
  }
}

async function checkFollowForFundAt(did: string): Promise<FollowedAccountCard | null> {
  const disclosureUrl = `${SLINGSHOT}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${FUND_DISCLOSURE}&rkey=self`
  const disclosure = await fetchJson<SlingshotRecord>(disclosureUrl)
  if (!disclosure?.value) return null

  const meta = readDisclosureMeta(disclosure.value)
  if (!meta.displayName && !meta.description && !meta.landingPage) return null

  // Fetch contribute links and identity in parallel
  const contributeUrl = `${SLINGSHOT}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${FUND_CONTRIBUTE}&rkey=self`
  const identityUrl = `${SLINGSHOT}/xrpc/blue.microcosm.identity.resolveMiniDoc?identifier=${encodeURIComponent(did)}`

  const [contribute, identity] = await Promise.all([
    fetchJson<SlingshotRecord>(contributeUrl),
    fetchJson<MiniDoc>(identityUrl),
  ])

  const links = contribute?.value ? readLinks(contribute.value) : undefined

  return {
    did,
    handle: identity?.handle,
    displayName: meta.displayName,
    description: meta.description,
    landingPage: meta.landingPage,
    links: links && links.length > 0 ? links : undefined,
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let idx = 0

  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i]!)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

/**
 * Fetches the user's follow list and checks each for fund.at records via Slingshot.
 * Uses the public Bluesky API for the follow list (no special OAuth scopes needed).
 * Returns only followed accounts that have fund.at.disclosure records.
 */
export async function scanFollows(
  did: string,
): Promise<FollowedAccountCard[]> {
  const agent = new Agent(PUBLIC_API)

  // Paginate through follows via public API
  const followedDids: string[] = []
  let cursor: string | undefined
  do {
    const res = await agent.app.bsky.graph.getFollows({
      actor: did,
      limit: 100,
      cursor,
    })
    for (const follow of res.data.follows) {
      followedDids.push(follow.did)
    }
    cursor = res.data.cursor
  } while (cursor)

  logger.info('follow-scan: fetched follows', {
    did,
    followCount: followedDids.length,
  })

  if (followedDids.length === 0) return []

  // Check each follow for fund.at records via Slingshot
  const results = await runWithConcurrency(followedDids, CONCURRENCY, async (did) => {
    try {
      return await checkFollowForFundAt(did)
    } catch (e) {
      logger.warn('follow-scan: error checking follow', {
        did,
        error: e instanceof Error ? e.message : String(e),
      })
      return null
    }
  })

  const cards = results.filter((r): r is FollowedAccountCard => r !== null)

  // Sort: accounts with contribute links first, then alphabetically by display name/handle
  cards.sort((a, b) => {
    const aHasLinks = !!(a.links && a.links.length > 0)
    const bHasLinks = !!(b.links && b.links.length > 0)
    if (aHasLinks !== bHasLinks) return aHasLinks ? -1 : 1
    const aName = a.displayName ?? a.handle ?? a.did
    const bName = b.displayName ?? b.handle ?? b.did
    return aName.localeCompare(bName)
  })

  logger.info('follow-scan: completed', {
    did,
    followsChecked: followedDids.length,
    withFundAt: cards.length,
  })

  return cards
}
