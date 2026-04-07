import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry, StewardTag } from '@/lib/steward-model'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { fetchOwnEndorsements } from '@/lib/fund-at-records'
import { createScanContext } from '@/lib/scan-context'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveStewardUri, lookupManualStewardRecord } from '@/lib/catalog'
import { collectNetworkEndorsementsCached, getCountsFromMap } from '@/lib/microcosm'
import { gatherAccounts } from './account-gather'
import type { ScanWarning } from './account-gather'
import { enrichAccounts } from './account-enrich'
import { attachCapabilities } from './capability-scan'
import { resolveDependencies, resolveDepEntry } from './dep-resolve'
import { discoverEcosystem } from './ecosystem-scan'
import type { EndorsementCounts } from './ecosystem-scan'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Stream event types (same interface the client expects)
// ---------------------------------------------------------------------------

export type { ScanWarning }
export type { EndorsementCounts }

export type ScanStreamEvent =
  | { type: 'meta'; did: string; handle?: string; pdsUrl?: string; endorsementsCapped?: boolean; followCount?: number }
  | { type: 'status'; message: string }
  | { type: 'endorsed'; uris: string[] }
  | { type: 'entry'; entry: StewardEntry }
  | { type: 'endorsement-counts'; counts: Record<string, EndorsementCounts> }
  | { type: 'warning'; warning: ScanWarning }
  | { type: 'done' }

// ---------------------------------------------------------------------------
// Streaming scan orchestrator
// ---------------------------------------------------------------------------

export async function scanStreaming(
  session: OAuthSession,
  selfReportedStewards: string[] = [],
  emit: (event: ScanStreamEvent) => void,
): Promise<void> {
  const ctx = createScanContext()

  // ── Endorsements: fetch early so the client can mark entries ────────────
  let endorsedUris: string[] = []
  try {
    endorsedUris = await fetchOwnEndorsements(session)
    if (endorsedUris.length > 0) {
      emit({ type: 'endorsed', uris: endorsedUris })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch endorsements'
    logger.warn('scan: endorsement fetch failed', { error: msg })
  }

  // ── Phase 1: Gather accounts ──────────────────────────────────────────
  const gathered = await gatherAccounts(session, selfReportedStewards, (msg) => {
    emit({ type: 'status', message: msg })
  }, ctx)

  emit({
    type: 'meta',
    did: gathered.did,
    handle: gathered.handle,
    pdsUrl: gathered.pdsUrl,
  })

  for (const w of gathered.warnings) {
    emit({ type: 'warning', warning: w })
  }

  // ── Collect network endorsements (single pass over all follows) ────────
  // O(follows): one PDS resolve + one listRecords per follow DID.
  // Builds a map of endorsed URI → Set<endorser DIDs> that we reuse for
  // ecosystem discovery AND per-card endorsement counts.
  const ENDORSEMENT_FOLLOW_CAP = 2500

  const allFollowDids: string[] = []
  for (const [did, stub] of gathered.accounts) {
    if (stub.tags.has('follow')) allFollowDids.push(did)
  }

  const endorsementsCapped = allFollowDids.length > ENDORSEMENT_FOLLOW_CAP
  const followDids = endorsementsCapped
    ? allFollowDids.slice(0, ENDORSEMENT_FOLLOW_CAP)
    : allFollowDids

  // Re-emit meta with follow count and cap status
  emit({
    type: 'meta',
    did: gathered.did,
    handle: gathered.handle,
    pdsUrl: gathered.pdsUrl,
    endorsementsCapped,
    followCount: allFollowDids.length,
  })

  if (endorsementsCapped) {
    emit({ type: 'status', message: `Scanning first ${ENDORSEMENT_FOLLOW_CAP.toLocaleString()} of ${allFollowDids.length.toLocaleString()} follows for endorsements…` })
  } else {
    emit({ type: 'status', message: `Scanning ${followDids.length} follows for endorsements…` })
  }

  let lastProgressEmit = 0
  const endorsementMap = await collectNetworkEndorsementsCached(followDids, (scanned, total) => {
    // Emit progress every 250 scanned to keep the stream alive
    if (scanned - lastProgressEmit >= 250 || scanned === total) {
      lastProgressEmit = scanned
      emit({ type: 'status', message: `Scanning endorsements… ${scanned.toLocaleString()}/${total.toLocaleString()}` })
    }
  })

  // ── Ecosystem discovery (fast lookup against pre-collected map) ────────
  const ecosystemUriCounts = new Map<string, EndorsementCounts>()

  try {
    const discovery = discoverEcosystem(endorsementMap)

    if (discovery.uris.size > 0) {
      // Build set of DIDs already gathered
      const existingDids = new Set<string>(gathered.accounts.keys())

      const uriEntries = [...discovery.uris.entries()]
        .filter(([uri]) => !existingDids.has(uri))

      await Promise.all(uriEntries.map(async ([uri, counts]) => {
        if (uri.startsWith('did:')) {
          if (!gathered.accounts.has(uri)) {
            gathered.accounts.set(uri, {
              did: uri,
              tags: new Set<StewardTag>(['ecosystem']),
              hostnames: new Set(),
            })
            ctx.prefetchUnbounded(uri)
            ecosystemUriCounts.set(uri, counts)
          }
          return
        }

        // Hostname — resolve to DID or drop
        const catalogEntry = lookupManualStewardRecord(uri)
        const lookupHostname = catalogEntry?.atprotoHandle ?? uri

        try {
          const did = await lookupAtprotoDid(lookupHostname)
          if (did && !existingDids.has(did) && !gathered.accounts.has(did)) {
            gathered.accounts.set(did, {
              did,
              tags: new Set<StewardTag>(['ecosystem']),
              hostnames: new Set([uri]),
            })
            ctx.prefetchUnbounded(did)
            ecosystemUriCounts.set(did, counts)
          }
        } catch { /* DNS lookup failed — drop */ }
      }))
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ecosystem injection failed'
    logger.warn('scan: ecosystem injection failed', { error: msg })
  }

  // ── Phase 2: Enrich ────────────────────────────────────────────────────
  emit({ type: 'status', message: `Resolving ${gathered.accounts.size} account${gathered.accounts.size === 1 ? '' : 's'}…` })

  const enriched = await enrichAccounts(
    session,
    gathered.accounts,
    (entry) => {
      if (entry.tags.length > 0) {
        emit({ type: 'entry', entry })
      }
    },
    ctx,
  )

  for (const w of enriched.warnings) {
    emit({ type: 'warning', warning: w })
  }

  // ── Phase 3: Capabilities ──────────────────────────────────────────────
  const allEntries = [...enriched.entries]

  if (gathered.feedUris.length > 0 || gathered.labelerDids.length > 0) {
    emit({ type: 'status', message: 'Loading feed and labeler details…' })
    await attachCapabilities(
      enriched.entries,
      gathered.feedUris,
      gathered.labelerDids,
      (entry) => emit({ type: 'entry', entry }),
    )
  }

  // ── Phase 4: Dependencies ──────────────────────────────────────────────
  emit({ type: 'status', message: 'Resolving dependencies…' })
  await resolveDependencies(allEntries, (entry) => {
    emit({ type: 'entry', entry })
  }, ctx)

  // ── Endorsed entries: resolve any endorsed URIs not already discovered.
  // Under DID-first, endorsed URIs are DIDs. We resolve any missing ones
  // and re-emit the endorsed set (all DIDs).
  if (endorsedUris.length > 0) {
    const knownDids = new Set<string>(allEntries.map((e) => e.did))

    const missing = endorsedUris.filter((uri) => !knownDids.has(uri))
    if (missing.length > 0) {
      emit({ type: 'status', message: `Resolving ${missing.length} endorsed entr${missing.length === 1 ? 'y' : 'ies'}…` })
      await Promise.all(missing.map(async (uri) => {
        try {
          const entry = await resolveDepEntry(uri, ctx)
          if (entry) {
            allEntries.push(entry)
            emit({ type: 'entry', entry })
          }
        } catch {
          // Best-effort — skip entries that can't be resolved
        }
      }))
    }

    // Re-emit endorsed set — all DIDs
    const resolvedEndorsed = new Set(endorsedUris)
    for (const uri of endorsedUris) {
      const entry = allEntries.find((e) => e.did === uri)
      if (entry) {
        resolvedEndorsed.add(entry.did)
      }
    }
    emit({ type: 'endorsed', uris: [...resolvedEndorsed] })
  }

  // ── Emit endorsement counts for ALL entries (from the single-pass map) ─
  const allCounts: Record<string, EndorsementCounts> = {}
  for (const entry of allEntries) {
    // DID is the canonical key — look up counts by DID
    const counts = getCountsFromMap(endorsementMap, entry.did)
    if (counts.networkEndorsementCount > 0) {
      allCounts[entry.did] = counts
    }
  }
  for (const [did, c] of ecosystemUriCounts) {
    if (!allCounts[did]) allCounts[did] = c
  }
  if (Object.keys(allCounts).length > 0) {
    emit({ type: 'endorsement-counts', counts: allCounts })
  }

  // ── PDS host ───────────────────────────────────────────────────────────
  // Always emit a pds-host entry so the user sees their data server in My Stack.
  // Funding details are optional — the entry shows regardless.
  if (gathered.pdsUrl) {
    try {
      const pdsHostname = new URL(gathered.pdsUrl).hostname

      // Walk the catalog chain to resolve physical hostname → entryway → operator.
      // Two-level example: lionsmane.us-east.host.bsky.network → bsky.social → bsky.app
      // One-level example: bsky.social → bsky.app (pdsHostname IS already the entryway)
      const step1 = resolveStewardUri(pdsHostname)
      const step2 = step1 ? resolveStewardUri(step1) : null
      const catalogEntryway = step2 ? step1 : (step1 ? pdsHostname : null)
      const catalogOperator = step2 ?? step1

      // Fetch funding against the catalog operator when known; otherwise try the physical URL
      const funding = await fetchFundingForUriLike(catalogOperator ?? gathered.pdsUrl)

      const entryway = catalogEntryway ?? funding?.pdsEntryway ?? pdsHostname
      const operator = catalogOperator ?? funding?.pdsStewardUri ?? pdsHostname

      // DID-first: only emit PDS entry if the operator resolves to a DID
      if (funding?.stewardDid) {
        const pdsEntry: StewardEntry = {
          uri: funding.stewardDid,
          did: funding.stewardDid,
          handle: funding.pdsStewardHandle,
          tags: ['tool', 'pds-host'],
          displayName: operator,
          contributeUrl: funding.contributeUrl,
          dependencies: funding.dependencies?.map((d) => d.uri),
          source: 'fund.at',
          capabilities: entryway !== operator
            ? [{ type: 'pds', name: entryway, hostname: entryway, landingPage: `https://${entryway}` }]
            : undefined,
        }
        emit({ type: 'entry', entry: pdsEntry })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDS host lookup failed'
      logger.warn('scan: PDS host lookup failed', { error: msg })
      emit({ type: 'warning', warning: { stewardUri: gathered.pdsUrl, step: 'pds-host-funding', message: msg } })
    }
  }

  logger.info('scan: completed', { did: gathered.did })
  emit({ type: 'done' })
}
