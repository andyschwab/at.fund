import { Client } from '@atproto/lex'
import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry, StewardTag, Capability } from '@/lib/steward-model'
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

type FeedInfo = {
  feedUri: string
  rkey: string
  creatorDid: string
  creatorHandle?: string
  name: string
  description?: string
}

type LabelerInfo = {
  did: string
  name: string
  description?: string
  creatorHandle?: string
}

async function fetchLabelerDisplayInfo(
  publicClient: Client,
  dids: string[],
): Promise<{ displayInfo: Map<string, DisplayInfo>; labelerCaps: LabelerInfo[] }> {
  const displayInfo = new Map<string, DisplayInfo>()
  const labelerCaps: LabelerInfo[] = []
  if (dids.length === 0) return { displayInfo, labelerCaps }
  try {
    const data = await xrpcQuery<{
      views?: Array<{
        uri?: string
        creator?: { did: string; displayName?: string; description?: string; handle?: string }
      }>
    }>(publicClient, 'app.bsky.labeler.getServices', {
      dids,
      detailed: false,
    })
    for (const view of data.views ?? []) {
      const creator = view.creator
      if (!creator) continue
      displayInfo.set(creator.did, {
        did: creator.did,
        displayName: creator.displayName ?? creator.handle ?? creator.did,
        description: creator.description,
        handle: creator.handle,
      })
      labelerCaps.push({
        did: creator.did,
        name: creator.displayName ?? creator.handle ?? creator.did,
        description: creator.description,
        creatorHandle: creator.handle,
      })
    }
  } catch (e) {
    logger.warn('subscriptions-scan: labeler display info fetch failed', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
  return { displayInfo, labelerCaps }
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
      const m = feedUri.match(/^at:\/\/(did:[^/]+)\/[^/]+\/([^/]+)$/)
      const creatorDid = view.creator?.did ?? m?.[1]
      if (!creatorDid) continue
      const rkey = m?.[2] ?? ''
      result.push({
        feedUri,
        rkey,
        creatorDid,
        creatorHandle: view.creator?.handle,
        name: view.displayName ?? (rkey || creatorDid),
        description: view.description,
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
// Handle backfill
// ---------------------------------------------------------------------------

/**
 * Batch-resolve handles for DIDs missing them via app.bsky.actor.getProfiles.
 * Returns a map of DID → handle for all resolved profiles.
 */
async function resolveHandles(
  publicClient: Client,
  dids: string[],
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  if (dids.length === 0) return resolved

  const BATCH = 25
  for (let i = 0; i < dids.length; i += BATCH) {
    const batch = dids.slice(i, i + BATCH)
    try {
      const data = await xrpcQuery<{
        profiles?: Array<{ did: string; handle?: string; displayName?: string }>
      }>(publicClient, 'app.bsky.actor.getProfiles', { actors: batch })
      for (const profile of data.profiles ?? []) {
        if (profile.handle) resolved.set(profile.did, profile.handle)
      }
    } catch (e) {
      logger.warn('subscriptions-scan: handle resolve failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return resolved
}

// ---------------------------------------------------------------------------
// Per-DID resolution: fund.at → manual catalog → fallback
// ---------------------------------------------------------------------------

async function resolveEntry(
  did: string,
  tag: StewardTag,
  fallback: DisplayInfo | undefined,
  capabilities?: Capability[],
): Promise<StewardEntry> {
  const base = {
    uri: did,
    did,
    handle: fallback?.handle,
    tags: [tag] as StewardTag[],
    displayName: fallback?.displayName ?? did,
    description: fallback?.description,
    landingPage: fallback?.landingPage,
    capabilities,
  }

  // Try fund.at records first
  try {
    const fundAt = await fetchFundAtForStewardDid(did)
    if (fundAt) {
      return {
        ...base,
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
      ...base,
      contributeUrl: manual.contributeUrl,
      dependencies: manual.dependencies,
      source: 'manual',
    }
  }

  // Fall back to Bluesky profile data
  return { ...base, source: 'unknown' }
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

  const [{ displayInfo: labelerDisplayInfo, labelerCaps }, feedInfoList] = await Promise.all([
    fetchLabelerDisplayInfo(publicClient, labelerDids),
    fetchFeedDisplayInfo(publicClient, feedUris),
  ])

  // Collect all unique DIDs that need handle resolution
  const allDids = new Set<string>()
  for (const did of labelerDids) allDids.add(did)
  for (const f of feedInfoList) allDids.add(f.creatorDid)

  const needsHandle = [...allDids].filter((did) => {
    const labelerHandle = labelerDisplayInfo.get(did)?.handle
    const feedHandle = feedInfoList.find((f) => f.creatorDid === did)?.creatorHandle
    return !labelerHandle && !feedHandle
  })

  const handleMap = await resolveHandles(publicClient, needsHandle)

  // Apply resolved handles back to display info
  for (const [did, handle] of handleMap) {
    const info = labelerDisplayInfo.get(did)
    if (info && !info.handle) info.handle = handle
  }

  // ── Build labeler entries with capabilities ──

  // Build labeler capabilities per DID
  const labelerCapsByDid = new Map<string, Capability[]>()
  for (const cap of labelerCaps) {
    const existing = labelerCapsByDid.get(cap.did) ?? []
    const handle = cap.creatorHandle ?? handleMap.get(cap.did)
    existing.push({
      type: 'labeler',
      name: cap.name,
      description: cap.description,
      landingPage: handle
        ? `https://bsky.app/profile/${handle}`
        : `https://bsky.app/profile/${cap.did}`,
    })
    labelerCapsByDid.set(cap.did, existing)
  }

  const labelerEntries = await runWithConcurrency(labelerDids, CONCURRENCY, (did) =>
    resolveEntry(did, 'labeler', labelerDisplayInfo.get(did), labelerCapsByDid.get(did)),
  )

  // ── Build feed entries grouped by creator DID ──

  // Group feeds by creator DID
  const feedsByCreator = new Map<string, FeedInfo[]>()
  for (const feed of feedInfoList) {
    const list = feedsByCreator.get(feed.creatorDid) ?? []
    list.push(feed)
    feedsByCreator.set(feed.creatorDid, list)
  }

  const feedCreatorDids = [...feedsByCreator.keys()]

  const feedEntries = await runWithConcurrency(feedCreatorDids, CONCURRENCY, (did) => {
    const feeds = feedsByCreator.get(did)!
    const handle = feeds[0]?.creatorHandle ?? handleMap.get(did)

    // Build capabilities for each feed
    const caps: Capability[] = feeds.map((f) => ({
      type: 'feed' as const,
      name: f.name,
      description: f.description,
      uri: f.feedUri,
      landingPage: (handle ?? f.creatorHandle)
        ? `https://bsky.app/profile/${handle ?? f.creatorHandle}/feed/${f.rkey}`
        : `https://bsky.app/profile/${f.creatorDid}/feed/${f.rkey}`,
    }))

    // Use the first feed's creator handle as fallback display info
    const fallback: DisplayInfo = {
      did,
      displayName: did,
      handle: handle ?? feeds[0]?.creatorHandle,
    }

    return resolveEntry(did, 'feed', fallback, caps)
  })

  const entries = [...labelerEntries, ...feedEntries]

  logger.info('subscriptions-scan: completed', {
    labelerCount: labelerEntries.length,
    feedCreatorCount: feedEntries.length,
    feedCount: feedInfoList.length,
    withFundAt: entries.filter((e) => e.source === 'fund.at').length,
  })

  return {
    entries,
    labelerCount: labelerEntries.length,
    feedCount: feedInfoList.length,
  }
}
