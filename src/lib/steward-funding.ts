import { Agent } from '@atproto/api'
import { extractPdsUrl } from '@atproto/did'
import type { AtprotoDidDocument } from '@atproto/did'

const FUND_CONTRIBUTE = 'fund.at.contribute'
const FUND_DISCLOSURE = 'fund.at.disclosure'
const FUND_DEPENDENCIES = 'fund.at.dependencies'

const PUBLIC_IDENTITY = 'https://public.api.bsky.app'

export type FundLink = { label: string; url: string }

export type StewardFundAt = {
  stewardDid: string
  links?: FundLink[]
  dependencyUris?: string[]
  disclosure: {
    displayName?: string
    description?: string
    landingPage?: string
  }
}

function readLinks(value: Record<string, unknown>): FundLink[] {
  const raw = value.links
  if (!Array.isArray(raw)) return []
  const out: FundLink[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    const label = (item as { label?: unknown }).label
    const url = (item as { url?: unknown }).url
    if (typeof label === 'string' && typeof url === 'string' && url.length > 0) {
      out.push({ label, url })
    }
  }
  return out
}

function normalizeHostname(domain: string): string | null {
  const d = domain.trim().toLowerCase().replace(/\.$/, '')
  if (!d) return null
  if (d.includes('/') || d.includes(':')) return null
  return d
}

function normalizeDependencyUri(uri: string): string | null {
  const raw = uri.trim()
  if (!raw) return null
  if (raw.startsWith('did:')) return raw
  return normalizeHostname(raw)
}

function readDependencyUris(value: Record<string, unknown>): string[] {
  const raw = value.uris
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const normalized = normalizeDependencyUri(item)
    if (normalized) out.push(normalized)
  }
  return out
}

function effectiveDateMs(value: Record<string, unknown>): number {
  const d = value.effectiveDate
  if (typeof d !== 'string') return 0
  const t = Date.parse(d)
  return Number.isNaN(t) ? 0 : t
}

/** Newest effectiveDate first; stable for ties (list order). */
function sortByEffectiveDateDesc(values: Record<string, unknown>[]): void {
  values.sort((a, b) => effectiveDateMs(b) - effectiveDateMs(a))
}

function pickBestContributeRecord(
  picked: Record<string, unknown>[],
): Record<string, unknown> | null {
  if (picked.length === 0) return null
  const copy = [...picked]
  sortByEffectiveDateDesc(copy)
  for (const v of copy) {
    if (readLinks(v).length > 0) return v
  }
  return null
}

function hasDisclosureMeta(val: Record<string, unknown>): boolean {
  const meta = val.meta
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false
  const m = meta as Record<string, unknown>
  return (
    typeof m.displayName === 'string' ||
    typeof m.description === 'string' ||
    typeof m.landingPage === 'string'
  )
}

function pickBestDisclosureRecord(
  picked: Record<string, unknown>[],
): Record<string, unknown> | null {
  const withMeta = picked.filter(hasDisclosureMeta)
  if (withMeta.length === 0) return null
  sortByEffectiveDateDesc(withMeta)
  return withMeta[0] ?? null
}

function isHostScopedDependencyRecord(value: Record<string, unknown>): boolean {
  const p = value.appliesToNsidPrefix
  if (typeof p !== 'string') return true
  return p.trim().length === 0
}

async function resolveStewardPdsUrl(stewardDid: string): Promise<URL | null> {
  try {
    const identityAgent = new Agent(PUBLIC_IDENTITY)
    const res = await identityAgent.com.atproto.identity.resolveIdentity({
      identifier: stewardDid,
    })
    return extractPdsUrl(res.data.didDoc as AtprotoDidDocument)
  } catch {
    return null
  }
}

/**
 * Fetches `fund.at.*` records for a steward DID.
 * Returns null if the steward does not publish disclosure metadata.
 */
export async function fetchFundAtForStewardDid(
  stewardDid: string,
): Promise<StewardFundAt | null> {
  const pdsUrl = await resolveStewardPdsUrl(stewardDid)
  if (!pdsUrl) return null

  const agent = new Agent(pdsUrl.origin)

  const contributeValues: Record<string, unknown>[] = []
  try {
    const listed = await agent.com.atproto.repo.listRecords({
      repo: stewardDid,
      collection: FUND_CONTRIBUTE,
      limit: 100,
    })
    for (const r of listed.data.records ?? []) {
      const v = r.value
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        contributeValues.push(v as Record<string, unknown>)
      }
    }
  } catch {
    // optional
  }

  const bestContribute = pickBestContributeRecord(contributeValues)
  const links = bestContribute ? readLinks(bestContribute) : undefined

  let disclosure: StewardFundAt['disclosure'] | undefined
  try {
    const discListed = await agent.com.atproto.repo.listRecords({
      repo: stewardDid,
      collection: FUND_DISCLOSURE,
      limit: 50,
    })
    const discValues: Record<string, unknown>[] = []
    for (const r of discListed.data.records ?? []) {
      const v = r.value
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        discValues.push(v as Record<string, unknown>)
      }
    }
    const best = pickBestDisclosureRecord(discValues)
    if (best) {
      const meta = best.meta as Record<string, unknown> | undefined
      if (meta && typeof meta === 'object') {
        disclosure = {
          displayName:
            typeof meta.displayName === 'string' ? meta.displayName : undefined,
          description:
            typeof meta.description === 'string' ? meta.description : undefined,
          landingPage:
            typeof meta.landingPage === 'string' ? meta.landingPage : undefined,
        }
      }
    }
  } catch {
    // required
  }

  let dependencyUris: string[] | undefined
  try {
    const depListed = await agent.com.atproto.repo.listRecords({
      repo: stewardDid,
      collection: FUND_DEPENDENCIES,
      limit: 100,
    })
    const merged = new Set<string>()
    for (const r of depListed.data.records ?? []) {
      const v = r.value
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue
      const rec = v as Record<string, unknown>
      if (!isHostScopedDependencyRecord(rec)) continue
      for (const u of readDependencyUris(rec)) merged.add(u)
    }
    if (merged.size > 0) {
      dependencyUris = [...merged].sort((a, b) => a.localeCompare(b))
    }
  } catch {
    // optional
  }

  if (!disclosure) return null

  return {
    stewardDid,
    links,
    dependencyUris,
    disclosure,
  }
}

