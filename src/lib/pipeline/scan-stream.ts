import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry } from '@/lib/steward-model'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import { fetchFundingForUriLike } from '@/lib/atfund-uri'
import { fetchOwnEndorsements } from '@/lib/fund-at-records'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { gatherAccounts } from './account-gather'
import type { AccountStub, UnresolvedService, ScanWarning } from './account-gather'
import { enrichAccounts } from './account-enrich'
import { attachCapabilities } from './capability-scan'
import { resolveDependencies } from './dep-resolve'
import { discoverEcosystem } from './ecosystem-scan'
import type { EndorsementCounts } from './ecosystem-scan'
import { logger } from '@/lib/logger'

// ---------------------------------------------------------------------------
// Stream event types (same interface the client expects)
// ---------------------------------------------------------------------------

export type { ScanWarning }
export type { PdsHostFunding }
export type { EndorsementCounts }

export type EcosystemEntry = StewardEntry & EndorsementCounts

export type ScanStreamEvent =
  | { type: 'meta'; did: string; handle?: string; pdsUrl?: string }
  | { type: 'status'; message: string }
  | { type: 'endorsed'; uris: string[] }
  | { type: 'entry'; entry: StewardEntry }
  | { type: 'referenced'; entry: StewardEntry }
  | { type: 'pds-host'; funding: PdsHostFunding }
  | { type: 'ecosystem'; entries: EcosystemEntry[] }
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
  // ── Endorsements: fetch early so the client can mark entries ────────────
  try {
    const endorsedUris = await fetchOwnEndorsements(session)
    if (endorsedUris.length > 0) {
      emit({ type: 'endorsed', uris: endorsedUris })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch endorsements'
    logger.warn('scan: endorsement fetch failed', { error: msg })
  }

  // ── Phase 1: Gather + start ecosystem fetch in parallel ────────────────
  // UFOs fetch runs concurrently with account gathering — no wasted time.
  // We don't know follows yet, so pass an empty set; we'll filter later.
  const ecosystemPromise = discoverEcosystem(new Set()).catch((e) => {
    logger.warn('scan: ecosystem prefetch failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  })

  const gathered = await gatherAccounts(session, selfReportedStewards, (msg) => {
    emit({ type: 'status', message: msg })
  })

  emit({
    type: 'meta',
    did: gathered.did,
    handle: gathered.handle,
    pdsUrl: gathered.pdsUrl,
  })

  for (const w of gathered.warnings) {
    emit({ type: 'warning', warning: w })
  }

  // ── Phase 2: Enrich ────────────────────────────────────────────────────
  emit({ type: 'status', message: `Resolving ${gathered.accounts.size} account${gathered.accounts.size === 1 ? '' : 's'}…` })

  const enriched = await enrichAccounts(
    session,
    gathered.accounts,
    gathered.unresolvedServices,
    (entry) => {
      // Only emit entries that have an identity (tools, follows).
      // Feed/labeler-only accounts are held until Phase 3 confirms their
      // capabilities — a feed is always a capability of an account, never
      // a standalone entry.
      if (entry.tags.length > 0) {
        emit({ type: 'entry', entry })
      }
    },
  )

  for (const w of enriched.warnings) {
    emit({ type: 'warning', warning: w })
  }

  // ── Phase 3: Capabilities ──────────────────────────────────────────────
  const allEntries = [...enriched.entries, ...enriched.unresolvedEntries]

  if (gathered.feedUris.length > 0 || gathered.labelerDids.length > 0) {
    emit({ type: 'status', message: 'Loading feed and labeler details…' })
    await attachCapabilities(
      enriched.entries, // only DID-keyed entries can have capabilities
      gathered.feedUris,
      gathered.labelerDids,
      (entry) => emit({ type: 'entry', entry }), // re-emit with capabilities
    )
  }

  // ── Phase 4: Dependencies ──────────────────────────────────────────────
  emit({ type: 'status', message: 'Resolving dependencies…' })
  await resolveDependencies(allEntries, (entry) => {
    emit({ type: 'referenced', entry })
  })

  // ── Phase 5: Ecosystem — enrich discovered URIs through the pipeline ───
  try {
    const discovery = await ecosystemPromise
    if (discovery && discovery.uris.size > 0) {
      emit({ type: 'status', message: 'Loading ecosystem…' })

      // Now that we have follows, recompute network counts
      const followDids = new Set<string>()
      for (const [did, stub] of gathered.accounts) {
        if (stub.tags.has('follow')) followDids.add(did)
      }

      // Re-discover with real follows for accurate network counts.
      // The cached UFOs data makes this instant.
      const finalDiscovery = followDids.size > 0
        ? await discoverEcosystem(followDids)
        : discovery

      // Filter out URIs already in scan results
      const existingUris = new Set<string>()
      for (const e of allEntries) {
        existingUris.add(e.uri)
        if (e.did) existingUris.add(e.did)
      }

      // Resolve each ecosystem URI → DID in parallel, then split into
      // resolved accounts (have a DID) vs unresolved (hostname only).
      const ecosystemAccounts = new Map<string, AccountStub>()
      const ecosystemUnresolved: UnresolvedService[] = []
      const ecosystemUriCounts = new Map<string, EndorsementCounts>()

      const uriEntries = [...finalDiscovery.uris.entries()]
        .filter(([uri]) => !existingUris.has(uri))

      await Promise.all(uriEntries.map(async ([uri, counts]) => {
        ecosystemUriCounts.set(uri, counts)

        if (uri.startsWith('did:')) {
          if (!existingUris.has(uri)) {
            ecosystemAccounts.set(uri, {
              did: uri,
              tags: new Set(['ecosystem']),
              hostnames: new Set(),
            })
          }
          return
        }

        // Hostname — check catalog for an atprotoHandle alias first
        const catalogEntry = lookupManualStewardRecord(uri)
        const lookupHostname = catalogEntry?.atprotoHandle ?? uri

        try {
          const did = await lookupAtprotoDid(lookupHostname)
          if (did && !existingUris.has(did)) {
            ecosystemAccounts.set(did, {
              did,
              tags: new Set(['ecosystem']),
              hostnames: new Set([uri]),
            })
            ecosystemUriCounts.set(did, counts)
            return
          }
        } catch { /* DNS lookup failed */ }

        // No DID found — use unresolved services path (handles hostnames properly)
        ecosystemUnresolved.push({ hostname: uri, tags: ['ecosystem'] })
      }))

      if (ecosystemAccounts.size > 0 || ecosystemUnresolved.length > 0) {
        // Run through the same enrichment pipeline
        const ecosystemEnriched = await enrichAccounts(
          session,
          ecosystemAccounts,
          ecosystemUnresolved,
        )

        // Attach endorsement counts and emit
        const allEcosystemEntries = [...ecosystemEnriched.entries, ...ecosystemEnriched.unresolvedEntries]

        // Resolve dependencies for ecosystem entries (Phase 4 already ran
        // for the main entries, so ecosystem deps need their own pass).
        // Include the main allEntries so we don't re-resolve known deps.
        const combinedForDepResolve = [...allEntries, ...allEcosystemEntries]
        await resolveDependencies(combinedForDepResolve, (entry) => {
          emit({ type: 'referenced', entry })
        })

        const ecosystemEntries: EcosystemEntry[] = []
        for (const entry of allEcosystemEntries) {
          const counts = ecosystemUriCounts.get(entry.uri)
            ?? (entry.did ? ecosystemUriCounts.get(entry.did) : undefined)
            ?? { endorsementCount: 0, networkEndorsementCount: 0 }

          ecosystemEntries.push({ ...entry, ...counts })
        }

        // Sort by endorsement count descending
        ecosystemEntries.sort(
          (a, b) => b.endorsementCount - a.endorsementCount || a.uri.localeCompare(b.uri),
        )

        if (ecosystemEntries.length > 0) {
          emit({ type: 'ecosystem', entries: ecosystemEntries })
        }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ecosystem scan failed'
    logger.warn('scan: ecosystem scan failed', { error: msg })
  }

  // ── PDS host funding (parallel with nothing — runs last) ───────────────
  if (gathered.pdsUrl) {
    try {
      const funding = await fetchFundingForUriLike(gathered.pdsUrl)
      if (funding) emit({ type: 'pds-host', funding })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'PDS host funding lookup failed'
      logger.warn('scan: PDS host funding failed', { error: msg })
      emit({ type: 'warning', warning: { stewardUri: gathered.pdsUrl, step: 'pds-host-funding', message: msg } })
    }
  }

  logger.info('scan: completed', { did: gathered.did })
  emit({ type: 'done' })
}
