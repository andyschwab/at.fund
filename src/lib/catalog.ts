import fs from 'node:fs'
import path from 'node:path'
import resolverJson from '@/data/resolver-catalog.json'
import { normalizeStewardUri } from '@/lib/steward-uri'
import type { FundLink } from '@/lib/fund-at-records'

type ManualDisclosure = {
  meta?: {
    displayName?: string
    description?: string
    landingPage?: string
  }
  contact?: {
    general?: {
      handle?: string
    }
  }
}

type ManualContribute = {
  links?: FundLink[]
}

type ManualDependencies = {
  uris?: string[]
}

type ManualRecord = {
  disclosure?: ManualDisclosure
  contribute?: ManualContribute
  dependencies?: ManualDependencies
}

type ResolverOverride = {
  matchPrefix: string
  stewardUri: string
}

type ResolverFile = {
  overrides: ResolverOverride[]
}

function loadCatalogRecords(): Record<string, ManualRecord> {
  const catalogDir = path.join(process.cwd(), 'src', 'data', 'catalog')
  const records: Record<string, ManualRecord> = {}
  for (const file of fs.readdirSync(catalogDir)) {
    if (!file.endsWith('.json')) continue
    const stewardUri = file.replace(/\.json$/, '')
    const content = fs.readFileSync(path.join(catalogDir, file), 'utf-8')
    records[stewardUri] = JSON.parse(content) as ManualRecord
  }
  return records
}

const manualCatalogRecords = loadCatalogRecords()
const resolverCatalog = resolverJson as ResolverFile

function normalizePrefix(prefix: string): string {
  if (prefix.includes('://')) return prefix
  return prefix.endsWith('.') ? prefix : `${prefix}.`
}

function inferHostnameFromNsidLike(value: string): string | null {
  const raw = value.trim()
  if (!raw) return null
  const parts = raw.split('.').filter(Boolean)
  if (parts.length < 2) return null
  const tld = parts[0]!.replace(/[^a-z0-9-]/gi, '').toLowerCase()
  const root = parts[1]!.replace(/[^a-z0-9-]/gi, '').toLowerCase()
  if (!tld || !root) return null
  return `${root}.${tld}`
}

function overrideForObservedKey(observedKey: string): string | null {
  let best: ResolverOverride | null = null
  for (const o of resolverCatalog.overrides ?? []) {
    const p = normalizePrefix(o.matchPrefix)
    if (observedKey === o.matchPrefix || observedKey.startsWith(p)) {
      if (!best || p.length > normalizePrefix(best.matchPrefix).length) best = o
    }
  }
  return best ? normalizeStewardUri(best.stewardUri) : null
}

/** Resolve any observed repo signal (NSID, $type, createdWith URL) to a steward URI (hostname or DID). */
export function resolveStewardUri(observedKey: string): string | null {
  const raw = observedKey.trim()
  if (!raw) return null

  const override = overrideForObservedKey(raw)
  if (override) return override

  if (raw.startsWith('did:')) return raw

  if (raw.includes('://')) {
    try {
      const u = new URL(raw)
      return u.hostname ? u.hostname.toLowerCase() : null
    } catch {
      return null
    }
  }

  const segments = raw.replace(/\.$/, '').split('.')
  if (segments.length >= 3) {
    return inferHostnameFromNsidLike(raw)
  }

  return normalizeStewardUri(raw)
}

export type ManualStewardRecord = {
  stewardUri: string
  displayName: string
  description?: string
  landingPage?: string
  /** fund.at.disclosure contact.general.handle */
  contactGeneralHandle?: string
  links: FundLink[]
  dependencies?: string[]
}

function buildHandleIndex(
  records: Record<string, ManualRecord>,
): Map<string, ManualStewardRecord> {
  const index = new Map<string, ManualStewardRecord>()
  for (const stewardUri of Object.keys(records)) {
    const record = lookupManualStewardRecord(stewardUri)
    if (!record?.contactGeneralHandle) continue
    index.set(record.contactGeneralHandle.toLowerCase(), record)
  }
  return index
}

const handleIndex = buildHandleIndex(manualCatalogRecords)

/**
 * Look up a catalog record by the account's Bluesky handle.
 * Handles the case where the catalog key (steward domain) differs from the handle.
 */
export function lookupManualStewardByHandle(handle: string): ManualStewardRecord | null {
  const normalized = handle.trim().replace(/^@/, '').toLowerCase()
  if (!normalized) return null
  return handleIndex.get(normalized) ?? null
}

/** Manual fallback keyed by steward URI. Returns fund.at-shaped data from our curated catalog. */
export function lookupManualStewardRecord(
  stewardUri: string,
): ManualStewardRecord | null {
  const key = normalizeStewardUri(stewardUri)
  if (!key) return null

  const record = manualCatalogRecords[key]
  if (!record) return null

  const meta = record.disclosure?.meta
  if (!meta?.displayName) return null

  const rawHandle = record.disclosure?.contact?.general?.handle
  let contactGeneralHandle: string | undefined
  if (typeof rawHandle === 'string') {
    const t = rawHandle.trim().replace(/^@/, '')
    if (t) contactGeneralHandle = t
  }

  return {
    stewardUri: key,
    displayName: meta.displayName,
    description: meta.description,
    landingPage: meta.landingPage,
    contactGeneralHandle,
    links: record.contribute?.links ?? [],
    dependencies: record.dependencies?.uris,
  }
}
