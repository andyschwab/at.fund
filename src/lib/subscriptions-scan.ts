import { Client } from '@atproto/lex'
import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry, StewardTag } from '@/lib/steward-model'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { xrpcQuery } from '@/lib/xrpc'
import { logger } from '@/lib/logger'

const CONCURRENCY = 8
const PUBLIC_API = 'https://public.api.bsky.app'

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
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

// ---------------------------------------------------------------------------
// Display-info helpers
// ---------------------------------------------------------------------------

type DisplayInfo = {
  did: string
  displayName: string
  description?: string
  handle?: string
  landingPage?: string
}

async function fetchLabelerDisplayInfo(
  publicClient: Client,
  dids: string[],
): Promise<Map<string, DisplayInfo>> {
  const result = new Map<string, DisplayInfo>()
  if (dids.length === 0) return result
  try {
    const data = await xrpcQuery<{
      views?: Array<{
        creator?: { did: string; displayName?: string; description?: string; handle?: string }
      }>
    }>(publicClient, 'app.bsky.labeler.getServices', {
      dids,
      detailed: false,
    })
    for (const view of data.views ?? []) {
      const creator = view.creator
      if (!creator) continue
      result.set(creator.did, {
        did: creator.did,
        displayName: creator.displayName ?? creator.handle ?? creator.did,
        description: creator.description,
        handle: creator.handle,
      })
    }
  } catch (e) {
    logger.warn('subscriptions-scan: labeler display info fetch failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
  return result
}

type FeedInfo = DisplayInfo & {
  /** The at:// URI of the feed generator record. */
  feedUri: string
  /** The rkey portion of the feed URI. */
  rkey: string
}

async function fetchFeedDisplayInfo(
  publicClient: Client,
  feedUris: string[],
): Promise<FeedInfo[]> {
  const result: FeedInfo[] = []
  if (feedUris.length === 0) return result
  try {
    const data = await xrpcQuery<{
      feeds?: Array<{
        uri?: string
        did?: string
        displayName?: string
        description?: string
        creator?: { did?: string; handle?: string }
      }>
    }>(publicClient, 'app.bsky.feed.getFeedGenerators', { feeds: feedUris })
    for (const view of data.feeds ?? []) {
      const feedUri = view.uri
      if (!feedUri) continue
      // Extract creator DID from the AT URI (at://did:plc:xxx/app.bsky.feed.generator/rkey)
      const m = feedUri.match(/^at:\/\/(did:[^/]+)\/[^/]+\/([^/]+)$/)
      const creatorDid = view.creator?.did ?? m?.[1]
      if (!creatorDid) continue
      const rkey = m?.[2] ?? ''
      result.push({
        feedUri,
        rkey,
        did: creatorDid,
        displayName: view.displayName ?? (rkey || creatorDid),
        description: view.description,
        handle: view.creator?.handle,
      })
    }
  } catch (e) {
    logger.warn('subscriptions-scan: feed generator display info fetch failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
  return result
}

// ---------------------------------------------------------------------------
// Per-DID resolution: fund.at → manual catalog → Bluesky profile fallback
// ---------------------------------------------------------------------------

/**
 * Batch-resolve handles for DIDs missing them via app.bsky.actor.getProfiles.
 * Mutates the provided DisplayInfo maps in-place.
 */
/**
 * Batch-resolve handles for DIDs missing them via app.bsky.actor.getProfiles.
 * Mutates the provided DisplayInfo items in-place.
 */
async function backfillHandles(
  publicClient: Client,
  items: DisplayInfo[],
): Promise<void> {
  const missing = [...new Set(items.filter((i) => !i.handle).map((i) => i.did))]
  if (missing.length === 0) return

  const BATCH = 25
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH)
    try {
      const data = await xrpcQuery<{
        profiles?: Array<{ did: string; handle?: string }>
      }>(publicClient, 'app.bsky.actor.getProfiles', { actors: batch })
      for (const profile of data.profiles ?? []) {
        if (!profile.handle) continue
        for (const item of items) {
          if (item.did === profile.did && !item.handle) {
            item.handle = profile.handle
          }
        }
      }
    } catch (e) {
      logger.warn('subscriptions-scan: handle backfill failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
}

async function resolveEntry(
  did: string,
  tag: StewardTag,
  fallback: DisplayInfo | undefined,
  opts?: { landingPage?: string; uri?: string },
): Promise<StewardEntry> {
  // For feeds, use the feed-specific URI so multiple feeds by the same
  // creator remain separate cards (not merged by DID).
  const entryUri = opts?.uri ?? did
  const entryDid = opts?.uri ? undefined : did

  // Try fund.at records first
  try {
    const fundAt = await fetchFundAtForStewardDid(did)
    if (fundAt) {
      return {
        uri: entryUri,
        did: entryDid,
        handle: fallback?.handle,
        tags: [tag],
        displayName: fallback?.displayName ?? did,
        description: fallback?.description,
        landingPage: opts?.landingPage ?? fallback?.landingPage,
        contributeUrl: fundAt.contributeUrl,
        dependencies: fundAt.dependencies?.map((d) => d.uri),
        source: 'fund.at',
      }
    }
  } catch {
    // fall through
  }

  // Try manual catalog by DID
  const manual = lookupManualStewardRecord(did)
  if (manual) {
    return {
      uri: entryUri,
      did: entryDid,
      handle: fallback?.handle,
      tags: [tag],
      displayName: fallback?.displayName ?? did,
      description: fallback?.description,
      landingPage: opts?.landingPage ?? fallback?.landingPage,
      contributeUrl: manual.contributeUrl,
      dependencies: manual.dependencies,
      source: 'manual',
    }
  }

  // Fall back to Bluesky profile data
  return {
    uri: entryUri,
    did: entryDid,
    handle: fallback?.handle,
    tags: [tag],
    displayName: fallback?.displayName ?? did,
    description: fallback?.description,
    landingPage: opts?.landingPage ?? fallback?.landingPage,
    source: 'unknown',
  }
}

// ---------------------------------------------------------------------------
// Public scan function
// ---------------------------------------------------------------------------

export type SubscriptionScanResult = {
  entries: StewardEntry[]
  labelerCount: number
  feedCount: number
}

export async function scanSubscriptions(
  session: OAuthSession,
): Promise<SubscriptionScanResult> {
  const authClient = new Client(session, {
    service: 'did:web:api.bsky.app#bsky_appview',
  })
  const publicClient = new Client(PUBLIC_API)

  let labelerDids: string[] = []
  let feedUris: string[] = []

  try {
    const prefs = await xrpcQuery<{
      preferences: Array<{
        $type: string
        labelers?: Array<{ did: string }>
        items?: Array<{ type: string; value: string }>
      }>
    }>(authClient, 'app.bsky.actor.getPreferences', {})

    for (const pref of prefs.preferences) {
      if (pref.$type === 'app.bsky.actor.defs#labelersPref' && pref.labelers) {
        labelerDids = pref.labelers.map((l) => l.did)
      }
      if (pref.$type === 'app.bsky.actor.defs#savedFeedsPrefV2' && pref.items) {
        feedUris = pref.items
          .filter((f) => f.type === 'feed')
          .map((f) => f.value)
      }
    }
  } catch (e) {
    logger.warn('subscriptions-scan: failed to fetch preferences', {
      error: e instanceof Error ? e.message : String(e),
    })
    return { entries: [], labelerCount: 0, feedCount: 0 }
  }

  logger.info('subscriptions-scan: found subscriptions', {
    labelerCount: labelerDids.length,
    feedCount: feedUris.length,
  })

  if (labelerDids.length === 0 && feedUris.length === 0) {
    return { entries: [], labelerCount: 0, feedCount: 0 }
  }

  const [labelerInfo, feedInfoList] = await Promise.all([
    fetchLabelerDisplayInfo(publicClient, labelerDids),
    fetchFeedDisplayInfo(publicClient, feedUris),
  ])

  // Resolve handles for any creators missing them
  const labelerInfoValues = [...labelerInfo.values()]
  await backfillHandles(publicClient, [...labelerInfoValues, ...feedInfoList])

  const [labelerEntries, feedEntries] = await Promise.all([
    runWithConcurrency(labelerDids, CONCURRENCY, (did) =>
      resolveEntry(did, 'labeler', labelerInfo.get(did)),
    ),
    runWithConcurrency(feedInfoList, CONCURRENCY, (feed) => {
      // Build a bsky.app link to the feed
      const feedLandingPage = feed.handle
        ? `https://bsky.app/profile/${feed.handle}/feed/${feed.rkey}`
        : `https://bsky.app/profile/${feed.did}/feed/${feed.rkey}`
      return resolveEntry(feed.did, 'feed', feed, {
        landingPage: feedLandingPage,
        uri: feed.feedUri,
      })
    }),
  ])

  const entries = [...labelerEntries, ...feedEntries]

  logger.info('subscriptions-scan: completed', {
    labelerCount: labelerEntries.length,
    feedCount: feedEntries.length,
    withFundAt: entries.filter((e) => e.source === 'fund.at').length,
  })

  return {
    entries,
    labelerCount: labelerEntries.length,
    feedCount: feedEntries.length,
  }
}
