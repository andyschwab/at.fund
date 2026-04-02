import { Client } from '@atproto/lex'
import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry, StewardTag } from '@/lib/steward-model'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { fetchOwnFundAtRecords } from '@/lib/fund-at-records'
import { xrpcQuery } from '@/lib/xrpc'
import { logger } from '@/lib/logger'
import type { AccountStub, UnresolvedService, ScanWarning } from './account-gather'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const PUBLIC_API = 'https://public.api.bsky.app'
const PROFILE_BATCH = 25
const CONCURRENCY = 10

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}

// ---------------------------------------------------------------------------
// Phase 2: Enrich accounts into StewardEntries
// ---------------------------------------------------------------------------

export type EnrichResult = {
  entries: StewardEntry[]
  unresolvedEntries: StewardEntry[]
  warnings: ScanWarning[]
}

export async function enrichAccounts(
  session: OAuthSession,
  accounts: Map<string, AccountStub>,
  unresolvedServices: UnresolvedService[],
  onEntry?: (entry: StewardEntry) => void,
): Promise<EnrichResult> {
  const client = new Client(session)
  const publicClient = new Client(PUBLIC_API)
  const warnings: ScanWarning[] = []

  // ── Batch-resolve profiles for handles + displayNames ──────────────────
  const needsProfile = [...accounts.values()].filter((a) => !a.handle)
  const profileDids = needsProfile.map((a) => a.did)

  for (let i = 0; i < profileDids.length; i += PROFILE_BATCH) {
    const batch = profileDids.slice(i, i + PROFILE_BATCH)
    try {
      const data = await xrpcQuery<{
        profiles?: Array<{ did: string; handle?: string; displayName?: string; description?: string; avatar?: string }>
      }>(publicClient, 'app.bsky.actor.getProfiles', { actors: batch })
      for (const p of data.profiles ?? []) {
        const stub = accounts.get(p.did)
        if (!stub) continue
        if (p.handle && !stub.handle) stub.handle = p.handle
        if (p.displayName && !stub.displayName) stub.displayName = p.displayName
        if (p.description && !stub.description) stub.description = p.description
        if (p.avatar && !stub.avatar) stub.avatar = p.avatar
      }
    } catch (e) {
      logger.warn('enrich: profile batch failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // ── Resolve each account: fund.at → manual catalog → fallback ──────────
  const accountList = [...accounts.values()]
  const entries = await runWithConcurrency(accountList, CONCURRENCY, async (stub) => {
    const tags = [...stub.tags] as StewardTag[]

    // Prefer hostname as URI (readable), fall back to handle, then DID
    const hostname = [...stub.hostnames][0]
    const uri = hostname ?? stub.handle ?? stub.did

    // Best displayName: profile name > hostname > handle > DID
    const displayName = stub.displayName && !stub.displayName.startsWith('did:')
      ? stub.displayName
      : hostname ?? stub.handle ?? stub.did

    const base: Omit<StewardEntry, 'source'> = {
      uri,
      did: stub.did,
      handle: stub.handle,
      avatar: stub.avatar,
      tags,
      displayName,
      description: stub.description,
    }

    // 1. Try fund.at records by DID
    try {
      let fundAt
      if (stub.did === session.did) {
        const own = await fetchOwnFundAtRecords(session)
        fundAt = own ? { stewardDid: stub.did, ...own } : null
      } else {
        fundAt = await fetchFundAtForStewardDid(stub.did, client)
      }
      if (fundAt) {
        // Also check manual catalog for extra deps
        const manual = lookupByAllKeys(stub)
        const entry: StewardEntry = {
          ...base,
          contributeUrl: fundAt.contributeUrl ?? manual?.contributeUrl,
          dependencies: mergeDeps(
            fundAt.dependencies?.map((d) => d.uri),
            manual?.dependencies,
          ),
          source: 'fund.at',
        }
        onEntry?.(entry)
        return entry
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'fund.at fetch failed'
      logger.warn('enrich: fund.at fetch failed', { did: stub.did, error: msg })
      warnings.push({ stewardUri: uri, step: 'fund-at-fetch', message: msg })
    }

    // 2. Try manual catalog by ALL keys (DID, hostnames, handle)
    const manual = lookupByAllKeys(stub)
    if (manual) {
      const entry: StewardEntry = {
        ...base,
        contributeUrl: manual.contributeUrl,
        dependencies: manual.dependencies,
        source: 'manual',
      }
      onEntry?.(entry)
      return entry
    }

    // 3. Fallback — unknown source
    const entry: StewardEntry = { ...base, source: 'unknown' }
    onEntry?.(entry)
    return entry
  })

  // ── Resolve unresolved services (hostname-only, no DID) ────────────────
  const unresolvedEntries: StewardEntry[] = []
  for (const svc of unresolvedServices) {
    const manual = lookupManualStewardRecord(svc.hostname)
    const entry: StewardEntry = {
      uri: svc.hostname,
      tags: svc.tags,
      displayName: svc.hostname,
      source: manual ? 'manual' : 'unknown',
      contributeUrl: manual?.contributeUrl,
      dependencies: manual?.dependencies,
    }
    unresolvedEntries.push(entry)
    onEntry?.(entry)
  }

  logger.info('enrich: completed', {
    accountCount: entries.length,
    unresolvedCount: unresolvedEntries.length,
    withFundAt: entries.filter((e) => e.source === 'fund.at').length,
    withManual: entries.filter((e) => e.source === 'manual').length,
  })

  return { entries, unresolvedEntries, warnings }
}

// ---------------------------------------------------------------------------
// Internal: try every key type for manual catalog
// ---------------------------------------------------------------------------

function lookupByAllKeys(stub: AccountStub) {
  // Try DID
  let record = lookupManualStewardRecord(stub.did)
  if (record) return record

  // Try hostnames
  for (const hostname of stub.hostnames) {
    record = lookupManualStewardRecord(hostname)
    if (record) return record
  }

  // Try handle
  if (stub.handle) {
    record = lookupManualStewardRecord(stub.handle)
    if (record) return record
  }

  return null
}

function mergeDeps(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined {
  if (!a && !b) return undefined
  const set = new Set([...(a ?? []), ...(b ?? [])])
  return set.size > 0 ? [...set].sort() : undefined
}
