import fs from 'node:fs'
import path from 'node:path'
import resolverJson from '@/data/resolver-catalog.json'
import { normalizeStewardUri } from '@/lib/steward-uri'

type ManualRecord = {
  contributeUrl?: string
  dependencies?: string[]
  /** PDS entryway hostnames this operator provides (e.g. ["bsky.social"]). */
  pdsHostnames?: string[]
}

type ResolverOverride = {
  matchPrefix?: string
  matchSuffix?: string
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
  let bestLen = -1

  for (const o of resolverCatalog.overrides ?? []) {
    if (o.matchPrefix !== undefined) {
      const p = normalizePrefix(o.matchPrefix)
      if (observedKey === o.matchPrefix || observedKey.startsWith(p)) {
        if (p.length > bestLen) { best = o; bestLen = p.length }
      }
    }
    if (o.matchSuffix !== undefined) {
      const bare = o.matchSuffix.startsWith('.') ? o.matchSuffix.slice(1) : o.matchSuffix
      const dotted = o.matchSuffix.startsWith('.') ? o.matchSuffix : `.${o.matchSuffix}`
      if (observedKey === bare || observedKey.endsWith(dotted)) {
        // Prefer longer suffixes; use negative length so longer wins over shorter
        if (dotted.length > bestLen) { best = o; bestLen = dotted.length }
      }
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
  contributeUrl?: string
  dependencies?: string[]
  pdsHostnames?: string[]
}

/** Manual fallback keyed by steward URI. Returns contribute/dependency/pdsHostnames from our curated catalog. */
export function lookupManualStewardRecord(
  stewardUri: string,
): ManualStewardRecord | null {
  const key = normalizeStewardUri(stewardUri)
  if (!key) return null

  const record = manualCatalogRecords[key]
  if (!record) return null

  const hasContent =
    record.contributeUrl ||
    (record.dependencies && record.dependencies.length > 0) ||
    (record.pdsHostnames && record.pdsHostnames.length > 0)
  if (!hasContent) return null

  return {
    stewardUri: key,
    contributeUrl: record.contributeUrl,
    dependencies: record.dependencies,
    pdsHostnames: record.pdsHostnames,
  }
}
