import { Agent } from '@atproto/api'
import type { FundLink } from '@/lib/fund-at-records'
import { lookupManualStewardByHandle } from '@/lib/catalog'
import { logger } from '@/lib/logger'

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

type FollowRef = {
  did: string
  handle?: string
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

async function checkFollowForFundAt(
  follow: FollowRef,
  agent: Agent,
): Promise<FollowedAccountCard | null> {
  const { did, handle } = follow

  // Try fund.at records via the authenticated agent
  try {
    const discRes = await agent.com.atproto.repo.getRecord({
      repo: did,
      collection: FUND_DISCLOSURE,
      rkey: 'self',
    })
    const discValue = discRes.data.value as Record<string, unknown> | undefined
    if (discValue) {
      const meta = readDisclosureMeta(discValue)
      if (meta.displayName || meta.description || meta.landingPage) {
        let links: FundLink[] | undefined
        try {
          const contRes = await agent.com.atproto.repo.getRecord({
            repo: did,
            collection: FUND_CONTRIBUTE,
            rkey: 'self',
          })
          const contValue = contRes.data.value as Record<string, unknown> | undefined
          if (contValue) {
            const l = readLinks(contValue)
            if (l.length > 0) links = l
          }
        } catch {
          // no contribute record
        }
        return {
          did,
          handle,
          displayName: meta.displayName,
          description: meta.description,
          landingPage: meta.landingPage,
          links,
        }
      }
    }
  } catch {
    // no disclosure record or fetch failed
  }

  // Fall back to manual catalog by handle
  if (handle) {
    const manual = lookupManualStewardByHandle(handle)
    if (manual) {
      return {
        did,
        handle,
        displayName: manual.displayName,
        description: manual.description,
        landingPage: manual.landingPage,
        links: manual.links.length > 0 ? manual.links : undefined,
      }
    }
  }

  return null
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
 * Fetches the user's follow list and checks each for fund.at records using
 * the provided authenticated agent, falling back to the manual catalog for
 * users identified by their handle.
 * Returns only followed accounts that have fund.at.disclosure records or a catalog entry.
 */
export async function scanFollows(
  did: string,
  agent?: Agent,
): Promise<FollowedAccountCard[]> {
  const readAgent = agent ?? new Agent(PUBLIC_API)

  // Paginate through follows, keeping handle alongside DID
  const follows: FollowRef[] = []
  let cursor: string | undefined
  do {
    const res = await readAgent.app.bsky.graph.getFollows({
      actor: did,
      limit: 100,
      cursor,
    })
    for (const follow of res.data.follows) {
      follows.push({ did: follow.did, handle: follow.handle })
    }
    cursor = res.data.cursor
  } while (cursor)

  logger.info('follow-scan: fetched follows', {
    did,
    followCount: follows.length,
  })

  if (follows.length === 0) return []

  // Check each follow for fund.at records or manual catalog entry
  const results = await runWithConcurrency(follows, CONCURRENCY, async (follow) => {
    try {
      return await checkFollowForFundAt(follow, readAgent)
    } catch (e) {
      logger.warn('follow-scan: error checking follow', {
        did: follow.did,
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
    followsChecked: follows.length,
    withFundAt: cards.length,
  })

  return cards
}
