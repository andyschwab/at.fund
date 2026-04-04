import type { OAuthSession } from '@atproto/oauth-client'
import type { StewardEntry, StewardTag } from '@/lib/steward-model'
import { buildIdentity, batchFetchProfiles } from '@/lib/identity'
import { resolveFunding } from '@/lib/funding'
import { logger } from '@/lib/logger'
import { runWithConcurrency } from '@/lib/concurrency'
import type { GatheredAccount, UnresolvedService, ScanWarning } from './account-gather'

const CONCURRENCY = 10

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
  accounts: Map<string, GatheredAccount>,
  unresolvedServices: UnresolvedService[],
  onEntry?: (entry: StewardEntry) => void,
): Promise<EnrichResult> {
  const warnings: ScanWarning[] = []

  // ── Batch-resolve profiles for handles, displayNames, and avatars ─────
  const needsProfile = [...accounts.values()].filter((a) => !a.avatar)
  const profileDids = needsProfile.map((a) => a.did)
  const profileMap = await batchFetchProfiles(profileDids)

  // Apply profile data back to stubs
  for (const stub of needsProfile) {
    const p = profileMap.get(stub.did)
    if (!p) continue
    if (p.handle && !stub.handle) stub.handle = p.handle
    if (p.displayName && !stub.displayName) stub.displayName = p.displayName
    if (p.description && !stub.description) stub.description = p.description
    if (p.avatar && !stub.avatar) stub.avatar = p.avatar
  }

  // ── Resolve each account: identity + funding ──────────────────────────
  const accountList = [...accounts.values()]
  const entries = await runWithConcurrency(accountList, CONCURRENCY, async (stub) => {
    const tags = [...stub.tags] as StewardTag[]
    const hostname = [...stub.hostnames][0]
    const isTool = stub.hostnames.size > 0

    const identity = buildIdentity({
      ref: hostname ?? stub.handle ?? stub.did,
      did: stub.did,
      handle: stub.handle,
      displayName: stub.displayName,
      description: stub.description,
      avatar: stub.avatar,
      isTool,
    })

    const { funding, warning } = await resolveFunding(identity, {
      session,
      extraCatalogKeys: [...stub.hostnames],
    })

    if (warning) {
      warnings.push({ stewardUri: identity.uri, step: warning.step, message: warning.message })
    }

    const entry: StewardEntry = { ...identity, ...funding, tags }
    onEntry?.(entry)
    return entry
  })

  // ── Resolve unresolved services (hostname-only, no DID) ────────────────
  const unresolvedEntries: StewardEntry[] = []
  for (const svc of unresolvedServices) {
    const identity = buildIdentity({ ref: svc.hostname, isTool: true })
    const { funding } = await resolveFunding(identity)
    const entry: StewardEntry = { ...identity, ...funding, tags: svc.tags }
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
