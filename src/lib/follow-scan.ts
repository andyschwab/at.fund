import { Client } from '@atproto/lex'
import { fetchFundAtRecords } from '@/lib/fund-at-records'
import { xrpcQuery } from '@/lib/xrpc'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { logger } from '@/lib/logger'

const PUBLIC_API = 'https://public.api.bsky.app'
const CONCURRENCY = 10

export type FollowedAccountCard = {
  did: string
  handle?: string
  displayName?: string
  description?: string
  landingPage?: string
  contributeUrl?: string
}

type FollowRef = {
  did: string
  handle?: string
  displayName?: string
  description?: string
}

async function checkFollowForFundAt(
  follow: FollowRef,
): Promise<FollowedAccountCard | null> {
  const { did, handle, displayName, description } = follow

  // Try fund.at records from the follow's own PDS
  try {
    const fundAt = await fetchFundAtRecords(did)
    if (fundAt?.contributeUrl) {
      return {
        did,
        handle,
        displayName,
        description,
        contributeUrl: fundAt.contributeUrl,
      }
    }
  } catch {
    // fund.at fetch failed — fall through to manual catalog
  }

  // Fall back to manual catalog by handle
  if (handle) {
    const manual = lookupManualStewardRecord(handle)
    if (manual?.contributeUrl) {
      return {
        did,
        handle,
        displayName,
        description,
        contributeUrl: manual.contributeUrl,
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
 * Fetches the user's follow list and checks each for fund.at.contribute records,
 * falling back to the manual catalog.
 * Returns only followed accounts that have a contribute URL.
 */
export async function scanFollows(
  did: string,
): Promise<FollowedAccountCard[]> {
  const publicClient = new Client(PUBLIC_API)

  // Paginate through follows
  const follows: FollowRef[] = []
  let cursor: string | undefined
  do {
    const res = await xrpcQuery<{
      follows: Array<{ did: string; handle?: string; displayName?: string; description?: string }>
      cursor?: string
    }>(publicClient, 'app.bsky.graph.getFollows', {
      actor: did,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    })
    for (const follow of res.follows) {
      follows.push({
        did: follow.did,
        handle: follow.handle,
        displayName: follow.displayName,
        description: follow.description,
      })
    }
    cursor = res.cursor
  } while (cursor)

  logger.info('follow-scan: fetched follows', {
    did,
    followCount: follows.length,
  })

  if (follows.length === 0) return []

  const results = await runWithConcurrency(follows, CONCURRENCY, async (follow) => {
    try {
      return await checkFollowForFundAt(follow)
    } catch (e) {
      logger.warn('follow-scan: error checking follow', {
        did: follow.did,
        error: e instanceof Error ? e.message : String(e),
      })
      return null
    }
  })

  const cards = results.filter((r): r is FollowedAccountCard => r !== null)

  // Sort: accounts with contribute URL first, then alphabetically
  cards.sort((a, b) => {
    const aHas = !!a.contributeUrl
    const bHas = !!b.contributeUrl
    if (aHas !== bHas) return aHas ? -1 : 1
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
