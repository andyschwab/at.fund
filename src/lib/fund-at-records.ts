import { Agent } from '@atproto/api'
import { extractPdsUrl } from '@atproto/did'
import type { AtprotoDidDocument } from '@atproto/did'

export const FUND_CONTRIBUTE = 'fund.at.contribute'
export const FUND_DISCLOSURE = 'fund.at.disclosure'
export const FUND_DEPENDENCIES = 'fund.at.dependencies'

const PUBLIC_IDENTITY = 'https://public.api.bsky.app'
const identityAgent = new Agent(PUBLIC_IDENTITY)

export type FundLink = { label: string; url: string }

export type DisclosureMeta = {
  displayName?: string
  description?: string
  landingPage?: string
}

export type FundAtResult = {
  links?: FundLink[]
  dependencyUris?: string[]
  disclosure: DisclosureMeta
}

// ---------------------------------------------------------------------------
// Record value helpers
// ---------------------------------------------------------------------------

type RawValue = Record<string, unknown>

function isObject(v: unknown): v is RawValue {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

export function collectRecordValues(
  records: { value: unknown }[],
): RawValue[] {
  const out: RawValue[] = []
  for (const r of records) {
    if (isObject(r.value)) out.push(r.value)
  }
  return out
}

export function readLinks(value: RawValue): FundLink[] {
  const raw = value.links
  if (!Array.isArray(raw)) return []
  const out: FundLink[] = []
  for (const item of raw) {
    if (!isObject(item)) continue
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

export function readDependencyUris(value: RawValue): string[] {
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

// ---------------------------------------------------------------------------
// Record selection
// ---------------------------------------------------------------------------

function effectiveDateMs(value: RawValue): number {
  const d = value.effectiveDate
  if (typeof d !== 'string') return 0
  const t = Date.parse(d)
  return Number.isNaN(t) ? 0 : t
}

function sortByEffectiveDateDesc(values: RawValue[]): void {
  values.sort((a, b) => effectiveDateMs(b) - effectiveDateMs(a))
}

export function pickBestContribute(values: RawValue[]): RawValue | null {
  if (values.length === 0) return null
  const copy = [...values]
  sortByEffectiveDateDesc(copy)
  for (const v of copy) {
    if (readLinks(v).length > 0) return v
  }
  return null
}

function hasDisclosureMeta(val: RawValue): boolean {
  const meta = val.meta
  if (!isObject(meta)) return false
  const m = meta as RawValue
  return (
    typeof m.displayName === 'string' ||
    typeof m.description === 'string' ||
    typeof m.landingPage === 'string'
  )
}

export function pickBestDisclosure(values: RawValue[]): RawValue | null {
  const withMeta = values.filter(hasDisclosureMeta)
  if (withMeta.length === 0) return null
  sortByEffectiveDateDesc(withMeta)
  return withMeta[0] ?? null
}

export function extractDisclosureMeta(value: RawValue): DisclosureMeta | null {
  const meta = value.meta
  if (!isObject(meta)) return null
  const m = meta as RawValue
  const displayName = typeof m.displayName === 'string' ? m.displayName : undefined
  const description = typeof m.description === 'string' ? m.description : undefined
  const landingPage = typeof m.landingPage === 'string' ? m.landingPage : undefined
  if (!displayName && !description && !landingPage) return null
  return { displayName, description, landingPage }
}

export function isHostScopedDependency(value: RawValue): boolean {
  const p = value.appliesToNsidPrefix
  if (typeof p !== 'string') return true
  return p.trim().length === 0
}

/** Checks whether a record's restrictToDomains allows a given hostname. */
export function allowlistedForDomain(
  value: RawValue,
  domain: string,
): boolean {
  const list = value.restrictToDomains
  if (list == null) return true
  if (!Array.isArray(list)) return false
  if (list.length === 0) return true

  const needle = normalizeHostname(domain)
  if (!needle) return false
  for (const item of list) {
    if (typeof item !== 'string') continue
    const n = normalizeHostname(item)
    if (n && n === needle) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// PDS resolution
// ---------------------------------------------------------------------------

export async function resolvePdsUrl(stewardDid: string): Promise<URL | null> {
  try {
    const res = await identityAgent.com.atproto.identity.resolveIdentity({
      identifier: stewardDid,
    })
    return extractPdsUrl(res.data.didDoc as AtprotoDidDocument)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// High-level fetch: all three fund.at.* collections from one PDS
// ---------------------------------------------------------------------------

/**
 * Fetches fund.at.* records for a DID from its PDS.
 * An optional `domainFilter` restricts records via `restrictToDomains`.
 * Returns null when no usable disclosure metadata exists.
 */
export async function fetchFundAtRecords(
  stewardDid: string,
  domainFilter?: string,
): Promise<FundAtResult | null> {
  const pdsUrl = await resolvePdsUrl(stewardDid)
  if (!pdsUrl) return null

  const agent = new Agent(pdsUrl.origin)
  const filter = (vals: RawValue[]) =>
    domainFilter ? vals.filter((v) => allowlistedForDomain(v, domainFilter)) : vals

  let contributeValues: RawValue[] = []
  try {
    const listed = await agent.com.atproto.repo.listRecords({
      repo: stewardDid,
      collection: FUND_CONTRIBUTE,
      limit: 100,
    })
    contributeValues = collectRecordValues(listed.data.records ?? [])
  } catch {
    // optional
  }

  const bestContribute = pickBestContribute(filter(contributeValues))
  const links = bestContribute ? readLinks(bestContribute) : undefined

  let disclosure: DisclosureMeta | undefined
  try {
    const discListed = await agent.com.atproto.repo.listRecords({
      repo: stewardDid,
      collection: FUND_DISCLOSURE,
      limit: 50,
    })
    const discValues = collectRecordValues(discListed.data.records ?? [])
    const best = pickBestDisclosure(filter(discValues))
    if (best) disclosure = extractDisclosureMeta(best) ?? undefined
  } catch {
    // optional
  }

  if (!disclosure) return null

  let dependencyUris: string[] | undefined
  try {
    const depListed = await agent.com.atproto.repo.listRecords({
      repo: stewardDid,
      collection: FUND_DEPENDENCIES,
      limit: 100,
    })
    const depValues = collectRecordValues(depListed.data.records ?? [])
    const merged = new Set<string>()
    for (const rec of filter(depValues)) {
      if (!isHostScopedDependency(rec)) continue
      for (const u of readDependencyUris(rec)) merged.add(u)
    }
    if (merged.size > 0) {
      dependencyUris = [...merged].sort((a, b) => a.localeCompare(b))
    }
  } catch {
    // optional
  }

  return { links, dependencyUris, disclosure }
}
