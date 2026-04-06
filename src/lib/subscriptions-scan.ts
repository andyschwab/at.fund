import { Client } from '@atproto/lex'
import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry, StewardTag, Capability } from '@/lib/steward-model'
import { buildIdentity, batchFetchProfiles } from '@/lib/identity'
import { resolveFunding } from '@/lib/funding'
import { xrpcQuery } from '@/lib/xrpc'
import { createScanContext } from '@/lib/scan-context'
import type { ScanContext } from '@/lib/scan-context'
import { logger } from '@/lib/logger'
import { PUBLIC_API } from '@/lib/constants'
import { runWithConcurrency } from '@/lib/concurrency'

const CONCURRENCY = 8

// ---------------------------------------------------------------------------
// Display-info helpers
// ---------------------------------------------------------------------------

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
): Promise<{ displayInfo: Map<string, { did: string; displayName: string; description?: string; handle?: string }>; labelerCaps: LabelerInfo[] }> {
  const displayInfo = new Map<string, { did: string; displayName: string; description?: string; handle?: string }>()
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
// Per-DID resolution using the resolution layer
// ---------------------------------------------------------------------------

async function resolveSubscriptionEntry(
  did: string,
  tag: StewardTag,
  fallback: { handle?: string; displayName?: string; description?: string } | undefined,
  capabilities: Capability[] | undefined,
  ctx: ScanContext,
): Promise<StewardEntry> {
  const identity = buildIdentity({
    did,
    handle: fallback?.handle,
    displayName: fallback?.displayName,
    description: fallback?.description,
  })

  const { funding } = await resolveFunding(identity, { ctx })

  return { ...identity, ...funding, tags: [tag], capabilities }
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
  ctx?: ScanContext,
): Promise<SubscriptionScanResult> {
  const scanCtx = ctx ?? createScanContext()
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

  // Collect all unique DIDs and fire prefetches
  const allDids = new Set<string>()
  for (const did of labelerDids) { allDids.add(did); scanCtx.prefetch(did) }
  for (const f of feedInfoList) { allDids.add(f.creatorDid); scanCtx.prefetch(f.creatorDid) }

  const needsHandle = [...allDids].filter((did) => {
    const labelerHandle = labelerDisplayInfo.get(did)?.handle
    const feedHandle = feedInfoList.find((f) => f.creatorDid === did)?.creatorHandle
    return !labelerHandle && !feedHandle
  })

  const handleMap = await batchFetchProfiles(needsHandle, publicClient)

  // Apply resolved handles back to display info
  for (const [did, profile] of handleMap) {
    const info = labelerDisplayInfo.get(did)
    if (info && !info.handle && profile.handle) info.handle = profile.handle
  }

  // ── Build labeler entries with capabilities ──

  const labelerCapsByDid = new Map<string, Capability[]>()
  for (const cap of labelerCaps) {
    const existing = labelerCapsByDid.get(cap.did) ?? []
    const handle = cap.creatorHandle ?? handleMap.get(cap.did)?.handle
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
    resolveSubscriptionEntry(did, 'labeler', labelerDisplayInfo.get(did), labelerCapsByDid.get(did), scanCtx),
  )

  // ── Build feed entries grouped by creator DID ──

  const feedsByCreator = new Map<string, FeedInfo[]>()
  for (const feed of feedInfoList) {
    const list = feedsByCreator.get(feed.creatorDid) ?? []
    list.push(feed)
    feedsByCreator.set(feed.creatorDid, list)
  }

  const feedCreatorDids = [...feedsByCreator.keys()]

  const feedEntries = await runWithConcurrency(feedCreatorDids, CONCURRENCY, (did) => {
    const feeds = feedsByCreator.get(did)!
    const handle = feeds[0]?.creatorHandle ?? handleMap.get(did)?.handle

    const caps: Capability[] = feeds.map((f) => ({
      type: 'feed' as const,
      name: f.name,
      description: f.description,
      uri: f.feedUri,
      landingPage: (handle ?? f.creatorHandle)
        ? `https://bsky.app/profile/${handle ?? f.creatorHandle}/feed/${f.rkey}`
        : `https://bsky.app/profile/${f.creatorDid}/feed/${f.rkey}`,
    }))

    const fallback = {
      displayName: did,
      handle: handle ?? feeds[0]?.creatorHandle,
    }

    return resolveSubscriptionEntry(did, 'feed', fallback, caps, scanCtx)
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
