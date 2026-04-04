import { Client } from '@atproto/lex'
import type { OAuthSession } from '@atproto/oauth-client'
import { xrpcQuery } from '@/lib/xrpc'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveStewardUri, lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { fetchOwnFundAtRecords, resolvePdsUrl } from '@/lib/fund-at-records'
import type { StewardEntry } from '@/lib/steward-model'
import { entryPriority } from '@/lib/entry-priority'
import { scanFollows } from '@/lib/follow-scan'
import { mergeIntoEntries, referencedStewardsToEntries } from '@/lib/steward-merge'
import { scanSubscriptions } from '@/lib/subscriptions-scan'
import {
  getBlueskyHandleFallback,
  handleFromDescribeRepo,
} from '@/lib/auth/session-handle'
import { filterThirdPartyCollections } from '@/lib/repo-inspect'
import {
  resolveCalendarCatalogKeys,
  resolveSiteStandardPairs,
  stripDerivedCollections,
} from '@/lib/repo-collection-resolve'
import { logger } from '@/lib/logger'

async function resolveSessionPdsUrl(
  session: OAuthSession,
  client: Client,
): Promise<URL | null> {
  try {
    const info = await session.getTokenInfo(false)
    const raw = info.aud?.trim()
    if (raw && /^https?:\/\//i.test(raw)) {
      return new URL(raw)
    }
  } catch {
    // ignore
  }
  try {
    return await resolvePdsUrl(session.did)
  } catch {
    return null
  }
}

export type ScanWarning = {
  stewardUri: string
  step: string
  message: string
}

export type ScanStreamEvent =
  | { type: 'meta'; did: string; handle?: string; pdsUrl?: string }
  | { type: 'status'; message: string }
  | { type: 'entry'; entry: StewardEntry }
  | { type: 'referenced'; entry: StewardEntry }
  | { type: 'warning'; warning: ScanWarning }
  | { type: 'done' }

export type ScanResult = {
  did: string
  handle?: string
  pdsUrl?: string
  entries: StewardEntry[]
  referencedEntries: StewardEntry[]
  warnings: ScanWarning[]
}

export async function scanRepo(
  session: OAuthSession,
  selfReportedStewards: string[] = [],
): Promise<ScanResult> {
  const client = new Client(session)

  const pdsUrl = await resolveSessionPdsUrl(session, client)

  const repoInfo = await xrpcQuery<{
    collections?: string[]
    handle?: string
  }>(client, 'com.atproto.repo.describeRepo', { repo: session.did })
  const collections = repoInfo.collections ?? []

  const handle =
    handleFromDescribeRepo(repoInfo) ??
    (await getBlueskyHandleFallback(session))

  const thirdParty = filterThirdPartyCollections(collections)
  const staticCols = stripDerivedCollections(thirdParty)
  const calendarKeys = await resolveCalendarCatalogKeys(
    client,
    session.did,
    thirdParty,
  )
  const siteStandardPairs = await resolveSiteStandardPairs(
    client,
    session.did,
    thirdParty,
  )

  const observed = new Set<string>()
  for (const c of staticCols) observed.add(c)
  for (const k of calendarKeys) observed.add(k)
  for (const pair of siteStandardPairs) observed.add(pair.contentType)
  for (const s of selfReportedStewards) observed.add(s)

  const stewardUris = new Set<string>()
  for (const key of observed) {
    const resolved = resolveStewardUri(key)
    if (resolved) stewardUris.add(resolved)
  }

  logger.info('scan: resolved steward URIs', {
    did: session.did,
    stewardCount: stewardUris.size,
    stewardUris: [...stewardUris].sort(),
  })

  const stewards: StewardEntry[] = []
  const warnings: ScanWarning[] = []

  for (const stewardUri of [...stewardUris].sort((a, b) => a.localeCompare(b))) {
    const isDid = stewardUri.startsWith('did:')
    let stewardDid: string | null = null

    if (isDid) {
      stewardDid = stewardUri
    } else {
      try {
        stewardDid = await lookupAtprotoDid(stewardUri)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'DNS lookup failed'
        logger.warn('scan: DNS lookup failed for steward', { stewardUri, error: msg })
        warnings.push({ stewardUri, step: 'dns-lookup', message: msg })
      }
    }

    const stewardDidOrUndefined = stewardDid ?? undefined
    const manual = lookupManualStewardRecord(stewardUri)

    if (stewardDid) {
      try {
        let fundAt
        if (stewardDid === session.did) {
          const ownRecords = await fetchOwnFundAtRecords(session)
          fundAt = ownRecords ? { stewardDid, ...ownRecords } : null
        } else {
          fundAt = await fetchFundAtForStewardDid(stewardDid)
        }
        if (fundAt) {
          stewards.push({
            uri: stewardUri,
            did: stewardDidOrUndefined,
            tags: ['tool'],
            displayName: stewardUri,
            contributeUrl: fundAt.contributeUrl ?? manual?.contributeUrl,
            dependencies: fundAt.dependencies?.map((d) => d.uri) ?? manual?.dependencies,
            source: 'fund.at',
          })
          continue
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch fund.at records'
        logger.warn('scan: fund.at fetch failed for steward', {
          stewardUri,
          stewardDid,
          error: msg,
        })
        warnings.push({ stewardUri, step: 'fund-at-fetch', message: msg })
      }
    }

    if (manual) {
      stewards.push({
        uri: stewardUri,
        did: stewardDidOrUndefined,
        tags: ['tool'],
        displayName: stewardUri,
        contributeUrl: manual.contributeUrl,
        dependencies: manual.dependencies,
        source: 'manual',
      })
      continue
    }

    stewards.push({
      uri: stewardUri,
      did: stewardDidOrUndefined,
      tags: ['tool'],
      displayName: stewardUri,
      source: 'unknown',
    })
  }

  // Resolve dep URIs that weren't in the main scan
  const { resolveDependencies } = await import('@/lib/pipeline/dep-resolve')
  const referencedStewards = await resolveDependencies(stewards)

  stewards.sort((a, b) => {
    const diff = entryPriority(a) - entryPriority(b)
    if (diff !== 0) return diff
    return a.uri.localeCompare(b.uri)
  })

  // Run PDS host, follow scan, and subscriptions scan in parallel
  let pdsEntry: StewardEntry | undefined
  let followEntries: StewardEntry[] = []
  let subscriptionEntries: StewardEntry[] = []

  const pdsHostPromise = (async () => {
    if (!pdsUrl) return
    try {
      const pdsHostname = new URL(pdsUrl.origin).hostname
      const funding = (await fetchFundingForUriLike(pdsUrl.origin)) ?? undefined
      const entryway = funding?.pdsEntryway ?? pdsHostname
      pdsEntry = {
        uri: funding?.pdsStewardUri ?? entryway,
        did: funding?.stewardDid,
        handle: funding?.pdsStewardHandle,
        tags: ['tool', 'pds-host'],
        displayName: funding?.pdsStewardUri ?? entryway,
        contributeUrl: funding?.contributeUrl,
        dependencies: funding?.dependencies?.map((d) => d.uri),
        source: funding ? 'fund.at' : 'unknown',
        capabilities: [{ type: 'pds', name: entryway, hostname: entryway, landingPage: `https://${entryway}` }],
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDS host lookup failed'
      logger.warn('scan: PDS host lookup failed', {
        pdsUrl: pdsUrl.origin,
        error: msg,
      })
      warnings.push({ stewardUri: pdsUrl.origin, step: 'pds-host-funding', message: msg })
    }
  })()

  const followsPromise = (async () => {
    try {
      followEntries = await scanFollows(session.did)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Follow scan failed'
      logger.warn('scan: follow scan failed', { did: session.did, error: msg })
      warnings.push({ stewardUri: session.did, step: 'follow-scan', message: msg })
    }
  })()

  const subscriptionsPromise = (async () => {
    try {
      const result = await scanSubscriptions(session)
      subscriptionEntries = result.entries
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Subscriptions scan failed'
      logger.warn('scan: subscriptions scan failed', { did: session.did, error: msg })
      warnings.push({ stewardUri: session.did, step: 'subscriptions-scan', message: msg })
    }
  })()

  await Promise.all([pdsHostPromise, followsPromise, subscriptionsPromise])

  logger.info('scan: completed', {
    did: session.did,
    stewardCount: stewards.length,
    subscriptionCount: subscriptionEntries.length,
    warningCount: warnings.length,
    sources: {
      fundAt: stewards.filter((s) => s.source === 'fund.at').length,
      manual: stewards.filter((s) => s.source === 'manual').length,
      unknown: stewards.filter((s) => s.source === 'unknown').length,
    },
  })

  const allStewards = pdsEntry ? [pdsEntry, ...stewards] : stewards
  return {
    did: session.did,
    handle,
    pdsUrl: pdsUrl?.origin,
    entries: mergeIntoEntries(allStewards, followEntries, subscriptionEntries),
    referencedEntries: referencedStewardsToEntries(referencedStewards),
    warnings,
  }
}

export async function scanRepoStreaming(
  session: OAuthSession,
  selfReportedStewards: string[] = [],
  rawEmit: (event: ScanStreamEvent) => void,
): Promise<void> {
  const client = new Client(session)

  emit({ type: 'status', message: 'Reading your repository\u2026' })

  const pdsUrl = await resolveSessionPdsUrl(session, client)

  const repoInfo = await xrpcQuery<{
    collections?: string[]
    handle?: string
  }>(client, 'com.atproto.repo.describeRepo', { repo: session.did })
  const collections = repoInfo.collections ?? []
  const handle =
    handleFromDescribeRepo(repoInfo) ??
    (await getBlueskyHandleFallback(session))

  emit({ type: 'meta', did: session.did, handle: handle ?? undefined, pdsUrl: pdsUrl?.origin })

  const thirdParty = filterThirdPartyCollections(collections)
  const staticCols = stripDerivedCollections(thirdParty)
  const [calendarKeys, siteStandardPairs] = await Promise.all([
    resolveCalendarCatalogKeys(client, session.did, thirdParty),
    resolveSiteStandardPairs(client, session.did, thirdParty),
  ])

  const observed = new Set<string>()
  for (const c of staticCols) observed.add(c)
  for (const k of calendarKeys) observed.add(k)
  for (const pair of siteStandardPairs) observed.add(pair.contentType)
  for (const s of selfReportedStewards) observed.add(s)

  const stewardUris = new Set<string>()
  for (const key of observed) {
    const resolved = resolveStewardUri(key)
    if (resolved) stewardUris.add(resolved)
  }

  logger.info('scan-streaming: resolved steward URIs', {
    did: session.did,
    stewardCount: stewardUris.size,
    stewardUris: [...stewardUris].sort(),
  })

  if (stewardUris.size > 0) {
    emit({ type: 'status', message: `Resolving ${stewardUris.size} steward${stewardUris.size === 1 ? '' : 's'}\u2026` })
  }

  const emittedUris = new Set<string>()
  const pendingDepUris = new Set<string>()
  /** Track DIDs that have been emitted — we'll backfill missing handles at the end. */
  const emittedDids = new Map<string, string>() // did → latest handle (or empty string)

  /** Wraps rawEmit to track which DIDs still need handles. */
  function emit(event: ScanStreamEvent) {
    if ((event.type === 'entry' || event.type === 'referenced') && event.entry.did) {
      const prev = emittedDids.get(event.entry.did)
      // Keep best handle seen so far
      emittedDids.set(event.entry.did, event.entry.handle ?? prev ?? '')
    }
    rawEmit(event)
  }

  await Promise.allSettled(
    [...stewardUris].sort().map(async (stewardUri) => {
      const isDid = stewardUri.startsWith('did:')
      let stewardDid: string | null = null

      if (isDid) {
        stewardDid = stewardUri
      } else {
        try {
          stewardDid = await lookupAtprotoDid(stewardUri)
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'DNS lookup failed'
          logger.warn('scan-streaming: DNS lookup failed', { stewardUri, error: msg })
          emit({ type: 'warning', warning: { stewardUri, step: 'dns-lookup', message: msg } })
        }
      }

      const stewardDidOrUndefined = stewardDid ?? undefined
      const manual = lookupManualStewardRecord(stewardUri)

      if (stewardDid) {
        try {
          let fundAt
          if (stewardDid === session.did) {
            const ownRecords = await fetchOwnFundAtRecords(session)
            fundAt = ownRecords ? { stewardDid, ...ownRecords } : null
          } else {
            fundAt = await fetchFundAtForStewardDid(stewardDid)
          }
          if (fundAt) {
            const deps = fundAt.dependencies?.map((d) => d.uri) ?? manual?.dependencies
            const entry: StewardEntry = {
              uri: stewardUri,
              did: stewardDidOrUndefined,
              tags: ['tool'],
              displayName: stewardUri,
              contributeUrl: fundAt.contributeUrl ?? manual?.contributeUrl,
              dependencies: deps,
              source: 'fund.at',
            }
            emittedUris.add(stewardUri)
            for (const dep of deps ?? []) pendingDepUris.add(dep)
            emit({ type: 'entry', entry })
            return
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to fetch fund.at records'
          logger.warn('scan-streaming: fund.at fetch failed', { stewardUri, stewardDid, error: msg })
          emit({ type: 'warning', warning: { stewardUri, step: 'fund-at-fetch', message: msg } })
        }
      }

      if (manual) {
        const entry: StewardEntry = {
          uri: stewardUri,
          did: stewardDidOrUndefined,
          tags: ['tool'],
          displayName: stewardUri,
          contributeUrl: manual.contributeUrl,
          dependencies: manual.dependencies,
          source: 'manual',
        }
        emittedUris.add(stewardUri)
        for (const dep of manual.dependencies ?? []) pendingDepUris.add(dep)
        emit({ type: 'entry', entry })
        return
      }

      emittedUris.add(stewardUri)
      emit({
        type: 'entry',
        entry: { uri: stewardUri, did: stewardDidOrUndefined, tags: ['tool'], displayName: stewardUri, source: 'unknown' },
      })
    }),
  )

  // Resolve pending dependency URIs that weren't emitted as primary entries
  {
    const { resolveDependencies } = await import('@/lib/pipeline/dep-resolve')
    // Build a synthetic entry whose dependencies are the pending URIs, so
    // resolveDependencies can walk them.
    const depHolder: StewardEntry = {
      uri: '_dep-holder',
      tags: ['tool'],
      displayName: '',
      source: 'unknown',
      dependencies: [...pendingDepUris].filter((u) => !emittedUris.has(u)),
    }
    await resolveDependencies([depHolder], (entry) => {
      emit({ type: 'referenced', entry })
    })
  }

  emit({ type: 'status', message: 'Loading follows and subscriptions\u2026' })
  await Promise.all([
    (async () => {
      if (!pdsUrl) return
      try {
        const pdsHostname = new URL(pdsUrl.origin).hostname
        const funding = await fetchFundingForUriLike(pdsUrl.origin)
        const entryway = funding?.pdsEntryway ?? pdsHostname
        const pdsEntry: StewardEntry = {
          uri: funding?.pdsStewardUri ?? entryway,
          did: funding?.stewardDid,
          handle: funding?.pdsStewardHandle,
          tags: ['tool', 'pds-host'],
          displayName: funding?.pdsStewardUri ?? entryway,
          contributeUrl: funding?.contributeUrl,
          dependencies: funding?.dependencies?.map((d) => d.uri),
          source: funding ? 'fund.at' : 'unknown',
          capabilities: [{ type: 'pds', name: entryway, hostname: entryway, landingPage: `https://${entryway}` }],
        }
        emit({ type: 'entry', entry: pdsEntry })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'PDS host lookup failed'
        logger.warn('scan-streaming: PDS host lookup failed', { pdsUrl: pdsUrl.origin, error: msg })
        emit({ type: 'warning', warning: { stewardUri: pdsUrl.origin, step: 'pds-host-funding', message: msg } })
      }
    })(),
    (async () => {
      try {
        const followEntries = await scanFollows(session.did)
        for (const entry of followEntries) {
          emit({ type: 'entry', entry })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Follow scan failed'
        logger.warn('scan-streaming: follow scan failed', { did: session.did, error: msg })
        emit({ type: 'warning', warning: { stewardUri: session.did, step: 'follow-scan', message: msg } })
      }
    })(),
    (async () => {
      try {
        const result = await scanSubscriptions(session)
        for (const entry of result.entries) {
          emit({ type: 'entry', entry })
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Subscriptions scan failed'
        logger.warn('scan-streaming: subscriptions scan failed', { did: session.did, error: msg })
        emit({ type: 'warning', warning: { stewardUri: session.did, step: 'subscriptions-scan', message: msg } })
      }
    })(),
  ])

  // ── Final handle backfill ──────────────────────────────────────────────
  // Batch-resolve handles for any emitted entries that still lack one.
  // This covers tools (never set handle), feeds/labelers whose creator
  // handle wasn't returned, and any other gaps.
  const missingHandleDids = [...emittedDids.entries()]
    .filter(([, handle]) => !handle)
    .map(([did]) => did)

  if (missingHandleDids.length > 0) {
    const publicClient = new Client('https://public.api.bsky.app')
    const BATCH = 25
    for (let i = 0; i < missingHandleDids.length; i += BATCH) {
      const batch = missingHandleDids.slice(i, i + BATCH)
      try {
        const data = await xrpcQuery<{
          profiles?: Array<{ did: string; handle?: string; displayName?: string }>
        }>(publicClient, 'app.bsky.actor.getProfiles', { actors: batch })
        for (const profile of data.profiles ?? []) {
          if (profile.handle || profile.displayName) {
            // Re-emit with handle + displayName so the client EntryIndex
            // can merge them in (the merge prefers non-DID displayNames)
            emit({
              type: 'entry',
              entry: {
                uri: profile.did,
                did: profile.did,
                handle: profile.handle,
                tags: [],
                displayName: profile.displayName ?? profile.handle ?? profile.did,
                source: 'unknown',
              },
            })
          }
        }
      } catch (e) {
        logger.warn('scan-streaming: handle backfill failed', {
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  logger.info('scan-streaming: completed', { did: session.did })
  emit({ type: 'done' })
}
