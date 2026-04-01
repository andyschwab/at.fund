import { Client } from '@atproto/lex'
import { extractPdsUrl } from '@atproto/did'
import type { AtprotoDidDocument } from '@atproto/did'
import type { OAuthSession } from '@atproto/oauth-client'
import { xrpcQuery } from '@/lib/xrpc'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveStewardUri, lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { fetchOwnFundAtRecords } from '@/lib/fund-at-records'
import type { StewardCardModel, StewardEntry } from '@/lib/steward-model'
import { scanFollows } from '@/lib/follow-scan'
import type { FollowedAccountCard } from '@/lib/follow-scan'
import { mergeIntoEntries, referencedStewardsToEntries, followedAccountToEntry } from '@/lib/steward-merge'
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

/**
 * OAuth requests use the token `aud` (resource server) as the PDS base URL.
 * `extractPdsUrl(didDoc)` can fail on some documents; `aud` matches the live
 * connection and should always be present for an OAuth session.
 */
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
    const resolved = await xrpcQuery<{ didDoc: unknown }>(
      client,
      'com.atproto.identity.resolveIdentity',
      { identifier: session.did },
    )
    return extractPdsUrl(resolved.didDoc as AtprotoDidDocument)
  } catch {
    return null
  }
}

export type { PdsHostFunding }
export type { FollowedAccountCard }

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
  | { type: 'pds-host'; funding: PdsHostFunding }
  | { type: 'warning'; warning: ScanWarning }
  | { type: 'done' }

export type ScanResult = {
  did: string
  handle?: string
  pdsUrl?: string
  /** Unified, deduplicated list of all discovered stewards. */
  entries: StewardEntry[]
  /** Resolved models for dependency URIs not in entries — used for lookup only, not rendered as cards. */
  referencedEntries: StewardEntry[]
  warnings: ScanWarning[]
  pdsHostFunding?: PdsHostFunding
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

  const stewards: StewardCardModel[] = []
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
          fundAt = await fetchFundAtForStewardDid(stewardDid, client)
        }
        if (fundAt) {
          const {
            displayName: dName,
            description: dDesc,
            landingPage: dLanding,
            ...disclosureExtras
          } = fundAt.disclosure
          stewards.push({
            stewardUri,
            stewardDid: stewardDidOrUndefined,
            displayName: dName ?? manual?.displayName ?? stewardUri,
            description: dDesc ?? manual?.description,
            landingPage: dLanding,
            links: fundAt.links,
            dependencies: fundAt.dependencyUris,
            source: 'fund.at',
            ...disclosureExtras,
            contactGeneralHandle:
              fundAt.disclosure.contactGeneralHandle ??
              manual?.contactGeneralHandle,
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
        // Fall through to manual catalog
      }
    }

    if (manual) {
      stewards.push({
        stewardUri,
        stewardDid: stewardDidOrUndefined,
        displayName: manual.displayName,
        description: manual.description,
        landingPage: manual.landingPage,
        contactGeneralHandle: manual.contactGeneralHandle,
        links: manual.links.length > 0 ? manual.links : undefined,
        dependencies: manual.dependencies,
        source: 'manual',
      })
      continue
    }

    stewards.push({
      stewardUri,
      stewardDid: stewardDidOrUndefined,
      displayName: stewardUri,
      source: 'unknown',
    })
  }

  // Resolve dep URIs that weren't in the main scan (catalog-only, no extra network calls).
  // These are needed so the UI can determine whether a steward's deps accept contributions.
  const referencedStewards: StewardCardModel[] = []
  const resolvedDepUris = new Set<string>()
  for (const s of stewards) {
    for (const depUri of s.dependencies ?? []) {
      if (!stewardUris.has(depUri) && !resolvedDepUris.has(depUri)) {
        resolvedDepUris.add(depUri)
        const manual = lookupManualStewardRecord(depUri)
        if (manual) {
          referencedStewards.push({
            stewardUri: depUri,
            displayName: manual.displayName,
            description: manual.description,
            landingPage: manual.landingPage,
            contactGeneralHandle: manual.contactGeneralHandle,
            links: manual.links.length > 0 ? manual.links : undefined,
            dependencies: manual.dependencies,
            source: 'manual',
          })
        }
      }
    }
  }

  /** Sort: direct (has contribute link) → dependency (has deps, no link) → none → unknown */
  function stewardTier(s: StewardCardModel): number {
    if (s.source === 'unknown') return 3
    if (s.links && s.links.length > 0) return 0
    if (s.dependencies && s.dependencies.length > 0) return 1
    return 2
  }
  stewards.sort((a, b) => {
    const diff = stewardTier(a) - stewardTier(b)
    if (diff !== 0) return diff
    return a.stewardUri.localeCompare(b.stewardUri)
  })

  // Run PDS host funding, follow scan, and subscriptions scan in parallel
  let pdsHostFunding: ScanResult['pdsHostFunding']
  let followedAccounts: FollowedAccountCard[] = []
  let subscriptionEntries: StewardEntry[] = []

  const pdsHostPromise = (async () => {
    if (!pdsUrl) return
    try {
      pdsHostFunding = (await fetchFundingForUriLike(pdsUrl.origin, client)) ?? undefined
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDS host funding lookup failed'
      logger.warn('scan: PDS host funding lookup failed', {
        pdsUrl: pdsUrl.origin,
        error: msg,
      })
      warnings.push({ stewardUri: pdsUrl.origin, step: 'pds-host-funding', message: msg })
    }
  })()

  const followsPromise = (async () => {
    try {
      followedAccounts = await scanFollows(session.did, client)
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

  return {
    did: session.did,
    handle,
    pdsUrl: pdsUrl?.origin,
    entries: mergeIntoEntries(stewards, followedAccounts, subscriptionEntries),
    referencedEntries: referencedStewardsToEntries(referencedStewards),
    warnings,
    pdsHostFunding,
  }
}

/**
 * Streaming variant of scanRepo. Emits events progressively as each steward
 * resolves rather than waiting for the full scan to complete.
 * Tool stewards are resolved in parallel; follows and subscriptions run
 * concurrently with the last resolution phase.
 */
export async function scanRepoStreaming(
  session: OAuthSession,
  selfReportedStewards: string[] = [],
  emit: (event: ScanStreamEvent) => void,
): Promise<void> {
  const client = new Client(session)

  emit({ type: 'status', message: 'Reading your repository…' })

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
    emit({ type: 'status', message: `Resolving ${stewardUris.size} steward${stewardUris.size === 1 ? '' : 's'}…` })
  }

  // Track emitted URIs so dep entries aren't duplicated
  const emittedUris = new Set<string>()
  const pendingDepUris = new Set<string>()

  // Resolve all tool stewards in parallel — emit each as it resolves
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
            fundAt = await fetchFundAtForStewardDid(stewardDid, client)
          }
          if (fundAt) {
            const { displayName: dName, description: dDesc, landingPage: dLanding, ...disclosureExtras } = fundAt.disclosure
            const entry: StewardEntry = {
              uri: stewardUri,
              did: stewardDidOrUndefined,
              tags: ['tool'],
              displayName: dName ?? manual?.displayName ?? stewardUri,
              description: dDesc ?? manual?.description,
              landingPage: dLanding,
              links: fundAt.links,
              dependencies: fundAt.dependencyUris,
              dependencyNotes: fundAt.dependencyNotes,
              source: 'fund.at',
              ...disclosureExtras,
              contactGeneralHandle: fundAt.disclosure.contactGeneralHandle ?? manual?.contactGeneralHandle,
            }
            emittedUris.add(stewardUri)
            for (const dep of fundAt.dependencyUris ?? []) pendingDepUris.add(dep)
            emit({ type: 'entry', entry })
            return
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Failed to fetch fund.at records'
          logger.warn('scan-streaming: fund.at fetch failed', { stewardUri, stewardDid, error: msg })
          emit({ type: 'warning', warning: { stewardUri, step: 'fund-at-fetch', message: msg } })
          // fall through to manual catalog
        }
      }

      if (manual) {
        const entry: StewardEntry = {
          uri: stewardUri,
          did: stewardDidOrUndefined,
          tags: ['tool'],
          displayName: manual.displayName,
          description: manual.description,
          landingPage: manual.landingPage,
          contactGeneralHandle: manual.contactGeneralHandle,
          links: manual.links.length > 0 ? manual.links : undefined,
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

  // Emit catalog-only dep entries (no extra network calls)
  for (const depUri of pendingDepUris) {
    if (!emittedUris.has(depUri)) {
      const manual = lookupManualStewardRecord(depUri)
      if (manual) {
        emit({
          type: 'referenced',
          entry: {
            uri: depUri,
            tags: ['tool'],
            displayName: manual.displayName,
            description: manual.description,
            landingPage: manual.landingPage,
            contactGeneralHandle: manual.contactGeneralHandle,
            links: manual.links.length > 0 ? manual.links : undefined,
            dependencies: manual.dependencies,
            source: 'manual',
          },
        })
      }
    }
  }

  // PDS host funding, follows, and subscriptions all in parallel
  emit({ type: 'status', message: 'Loading follows and subscriptions…' })
  await Promise.all([
    (async () => {
      if (!pdsUrl) return
      try {
        const funding = await fetchFundingForUriLike(pdsUrl.origin, client)
        if (funding) emit({ type: 'pds-host', funding })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'PDS host funding lookup failed'
        logger.warn('scan-streaming: PDS host funding lookup failed', { pdsUrl: pdsUrl.origin, error: msg })
        emit({ type: 'warning', warning: { stewardUri: pdsUrl.origin, step: 'pds-host-funding', message: msg } })
      }
    })(),
    (async () => {
      try {
        const followedAccounts = await scanFollows(session.did, client)
        for (const account of followedAccounts) {
          emit({ type: 'entry', entry: followedAccountToEntry(account) })
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

  logger.info('scan-streaming: completed', { did: session.did })
  emit({ type: 'done' })
}
