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

async function fetchFeedDisplayInfo(
  publicClient: Client,
  feedUris: string[],
): Promise<Map<string, DisplayInfo>> {
  const result = new Map<string, DisplayInfo>()
  if (feedUris.length === 0) return result
  try {
    const data = await xrpcQuery<{
      feeds?: Array<{
        did?: string
        displayName?: string
        description?: string
        creator?: { handle?: string }
      }>
    }>(publicClient, 'app.bsky.feed.getFeedGenerators', { feeds: feedUris })
    for (const view of data.feeds ?? []) {
      const did = view.did
      if (!did) continue
      result.set(did, {
        did,
        displayName: view.displayName ?? did,
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

async function resolveEntry(
  did: string,
  tag: StewardTag,
  fallback: DisplayInfo | undefined,
): Promise<StewardEntry> {
  // Try fund.at records first
  try {
    const fundAt = await fetchFundAtForStewardDid(did)
    if (fundAt) {
      return {
        uri: did,
        did,
        handle: fallback?.handle,
        tags: [tag],
        displayName: fallback?.displayName ?? did,
        description: fallback?.description,
        landingPage: fallback?.landingPage,
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
      uri: did,
      did,
      handle: fallback?.handle,
      tags: [tag],
      displayName: fallback?.displayName ?? did,
      description: fallback?.description,
      landingPage: fallback?.landingPage,
      contributeUrl: manual.contributeUrl,
      dependencies: manual.dependencies,
      source: 'manual',
    }
  }

  // Fall back to Bluesky profile data
  return {
    uri: did,
    did,
    handle: fallback?.handle,
    tags: [tag],
    displayName: fallback?.displayName ?? did,
    description: fallback?.description,
    landingPage: fallback?.landingPage,
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

  const [labelerInfo, feedInfo] = await Promise.all([
    fetchLabelerDisplayInfo(publicClient, labelerDids),
    fetchFeedDisplayInfo(publicClient, feedUris),
  ])

  const feedRkeyByDid = new Map<string, string>()
  for (const uri of feedUris) {
    const m = uri.match(/^at:\/\/(did:[^/]+)\/[^/]+\/([^/]+)$/)
    if (m) feedRkeyByDid.set(m[1]!, m[2]!)
  }

  const feedDids = [
    ...new Set([...feedRkeyByDid.keys(), ...feedInfo.keys()]),
  ]

  const [labelerEntries, feedEntries] = await Promise.all([
    runWithConcurrency(labelerDids, CONCURRENCY, (did) =>
      resolveEntry(did, 'labeler', labelerInfo.get(did)),
    ),
    runWithConcurrency(feedDids, CONCURRENCY, (did) => {
      const fallback = feedInfo.get(did) ?? (feedRkeyByDid.has(did)
        ? { did, displayName: feedRkeyByDid.get(did)! }
        : undefined)
      return resolveEntry(did, 'feed', fallback)
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
