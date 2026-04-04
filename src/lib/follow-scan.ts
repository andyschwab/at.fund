import { Client } from '@atproto/lex'
import type { StewardEntry } from '@/lib/steward-model'
import { buildIdentity } from '@/lib/identity'
import { resolveFundingForDep } from '@/lib/funding'
import { xrpcQuery } from '@/lib/xrpc'
import { createScanContext } from '@/lib/scan-context'
import type { ScanContext } from '@/lib/scan-context'
import { logger } from '@/lib/logger'
import { PUBLIC_API } from '@/lib/constants'
import { runWithConcurrency } from '@/lib/concurrency'

const CONCURRENCY = 10

type FollowRef = {
  did: string
  handle?: string
  displayName?: string
  description?: string
}

async function resolveFollowEntry(
  follow: FollowRef,
  ctx: ScanContext,
): Promise<StewardEntry | null> {
  const identity = buildIdentity({
    ref: follow.handle ?? follow.did,
    did: follow.did,
    handle: follow.handle,
    displayName: follow.displayName,
    description: follow.description,
  })

  const funding = await resolveFundingForDep(identity, ctx)

  // Only return follows that have a contribute URL
  if (!funding.contributeUrl) return null

  return { ...identity, ...funding, tags: ['follow'] }
}

/**
 * Fetches the user's follow list and checks each for fund.at.contribute records,
 * falling back to the manual catalog.
 * Returns only followed accounts that have a contribute URL, as StewardEntries.
 */
export async function scanFollows(
  did: string,
  ctx?: ScanContext,
): Promise<StewardEntry[]> {
  const scanCtx = ctx ?? createScanContext()
  const publicClient = new Client(PUBLIC_API)

  // Paginate through follows, firing prefetches as we discover DIDs
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
      scanCtx.prefetch(follow.did)
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
      return await resolveFollowEntry(follow, scanCtx)
    } catch (e) {
      logger.warn('follow-scan: error checking follow', {
        did: follow.did,
        error: e instanceof Error ? e.message : String(e),
      })
      return null
    }
  })

  const entries = results.filter((r): r is StewardEntry => r !== null)

  // Sort: alphabetically by display name
  entries.sort((a, b) => a.displayName.localeCompare(b.displayName))

  logger.info('follow-scan: completed', {
    did,
    followsChecked: follows.length,
    withFundAt: entries.length,
  })

  return entries
}
