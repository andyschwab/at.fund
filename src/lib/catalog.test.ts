import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { resolveStewardUri, lookupManualStewardRecord } from './catalog'

// ---------------------------------------------------------------------------
// Load admin-managed data so tests stay in sync with whatever is in the catalog
// ---------------------------------------------------------------------------

const CATALOG_DIR = join(__dirname, '..', 'data', 'catalog')
const RESOLVER_PATH = join(__dirname, '..', 'data', 'resolver-catalog.json')

const catalogFiles = readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json'))
const catalogKeys = catalogFiles.map((f) => f.replace(/\.json$/, ''))

const resolverData = JSON.parse(readFileSync(RESOLVER_PATH, 'utf-8')) as {
  overrides: { matchPrefix?: string; matchSuffix?: string; stewardUri: string }[]
}

// ---------------------------------------------------------------------------
// resolveStewardUri — algorithm tests (no dependency on catalog data)
// ---------------------------------------------------------------------------

describe('resolveStewardUri', () => {
  it('returns null for empty input', () => {
    expect(resolveStewardUri('')).toBeNull()
    expect(resolveStewardUri('  ')).toBeNull()
  })

  it('passes through DID identifiers', () => {
    expect(resolveStewardUri('did:plc:abc123')).toBe('did:plc:abc123')
  })

  it('extracts hostname from URLs', () => {
    expect(resolveStewardUri('https://example.com/app')).toBe('example.com')
    expect(resolveStewardUri('https://Sub.Example.COM')).toBe('sub.example.com')
  })

  it('infers hostname from 3-segment NSIDs', () => {
    expect(resolveStewardUri('com.example.app')).toBe('example.com')
  })

  it('infers hostname from deep NSIDs', () => {
    expect(resolveStewardUri('io.github.myapp.feature')).toBe('github.io')
  })

  it('handles 2-segment inputs as domains', () => {
    expect(resolveStewardUri('example.com')).toBe('example.com')
    expect(resolveStewardUri('test.org')).toBe('test.org')
  })

  // Data-driven: every prefix override in resolver-catalog.json resolves correctly
  it('applies every prefix override from resolver-catalog.json', () => {
    const errors: string[] = []
    for (const o of resolverData.overrides) {
      if (!o.matchPrefix) continue
      // Build a synthetic NSID that starts with the prefix
      const testInput = o.matchPrefix.endsWith('.')
        ? `${o.matchPrefix}test`
        : `${o.matchPrefix}.test`
      const result = resolveStewardUri(testInput)
      if (result !== o.stewardUri) {
        errors.push(`${testInput} → expected "${o.stewardUri}", got "${result}"`)
      }
    }
    if (errors.length > 0) {
      expect.fail(`Prefix override failures:\n  ${errors.join('\n  ')}`)
    }
  })

  it('applies every suffix override from resolver-catalog.json', () => {
    const errors: string[] = []
    for (const o of resolverData.overrides) {
      if (!o.matchSuffix) continue
      const testInput = `test${o.matchSuffix.startsWith('.') ? '' : '.'}${o.matchSuffix}`
      const result = resolveStewardUri(testInput)
      if (result !== o.stewardUri) {
        errors.push(`${testInput} → expected "${o.stewardUri}", got "${result}"`)
      }
    }
    if (errors.length > 0) {
      expect.fail(`Suffix override failures:\n  ${errors.join('\n  ')}`)
    }
  })
})

// ---------------------------------------------------------------------------
// lookupManualStewardRecord — data-driven against actual catalog
// ---------------------------------------------------------------------------

describe('lookupManualStewardRecord', () => {
  it('returns null for unknown steward URIs', () => {
    expect(lookupManualStewardRecord('nonexistent.example.com')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(lookupManualStewardRecord('')).toBeNull()
  })

  it('every catalog entry with content is retrievable', () => {
    const errors: string[] = []
    for (const key of catalogKeys) {
      const raw = JSON.parse(
        readFileSync(join(CATALOG_DIR, `${key}.json`), 'utf-8'),
      ) as Record<string, unknown>

      const hasContent =
        raw.contributeUrl ||
        (Array.isArray(raw.dependencies) && raw.dependencies.length > 0) ||
        (Array.isArray(raw.tags) && raw.tags.length > 0) ||
        (Array.isArray(raw.pdsHostnames) && raw.pdsHostnames.length > 0)

      if (!hasContent) continue // empty entries return null by design

      const record = lookupManualStewardRecord(key)
      if (!record) {
        errors.push(`${key}: expected a record but got null`)
        continue
      }
      if (record.stewardUri !== key) {
        errors.push(`${key}: stewardUri is "${record.stewardUri}" instead of "${key}"`)
      }
    }
    if (errors.length > 0) {
      expect.fail(`Catalog lookup failures:\n  ${errors.join('\n  ')}`)
    }
  })

  it('is case-insensitive', () => {
    // Pick the first catalog entry with content to test case insensitivity
    const key = catalogKeys.find((k) => lookupManualStewardRecord(k) !== null)
    if (!key) return // catalog is empty — nothing to test
    const lower = lookupManualStewardRecord(key)
    const upper = lookupManualStewardRecord(key.toUpperCase())
    expect(lower).toEqual(upper)
  })

  it('returned records have well-formed fields', () => {
    const errors: string[] = []
    for (const key of catalogKeys) {
      const record = lookupManualStewardRecord(key)
      if (!record) continue

      if (typeof record.stewardUri !== 'string') {
        errors.push(`${key}: stewardUri must be a string`)
      }
      if (record.contributeUrl !== undefined && typeof record.contributeUrl !== 'string') {
        errors.push(`${key}: contributeUrl must be a string if present`)
      }
      if (record.dependencies !== undefined && !Array.isArray(record.dependencies)) {
        errors.push(`${key}: dependencies must be an array if present`)
      }
      if (record.pdsHostnames !== undefined && !Array.isArray(record.pdsHostnames)) {
        errors.push(`${key}: pdsHostnames must be an array if present`)
      }
    }
    if (errors.length > 0) {
      expect.fail(`Record field errors:\n  ${errors.join('\n  ')}`)
    }
  })
})
