import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { lookupManualStewardRecord } from '@/lib/catalog'

const CATALOG_DIR = join(__dirname, 'catalog')
const RESOLVER_PATH = join(__dirname, 'resolver-catalog.json')

const ALLOWED_KEYS = new Set([
  'did',
  'contributeUrl',
  'dependencies',
  'tags',
  'atprotoHandle',
  'pdsHostnames',
])

// ---------------------------------------------------------------------------
// Catalog entry validation — one sweep, not per-file tests
// ---------------------------------------------------------------------------

describe('catalog entries', () => {
  const files = readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json'))

  it('catalog directory is not empty', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('every entry is valid JSON with allowed schema', () => {
    const errors: string[] = []

    for (const file of files) {
      const raw = readFileSync(join(CATALOG_DIR, file), 'utf-8')
      let data: Record<string, unknown>
      try {
        data = JSON.parse(raw)
      } catch {
        errors.push(`${file}: invalid JSON`)
        continue
      }

      if (typeof data !== 'object' || data === null) {
        errors.push(`${file}: root must be an object`)
        continue
      }

      // Unknown keys
      for (const key of Object.keys(data)) {
        if (!ALLOWED_KEYS.has(key)) {
          errors.push(`${file}: unexpected key "${key}"`)
        }
      }

      // DID field required (DID-first invariant)
      if (typeof data.did !== 'string' || !data.did.startsWith('did:')) {
        errors.push(`${file}: must have a "did" field starting with "did:"`)
      }

      // contributeUrl format
      if (typeof data.contributeUrl === 'string') {
        try {
          const url = new URL(data.contributeUrl)
          if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            errors.push(`${file}: contributeUrl must be http(s)`)
          }
        } catch {
          errors.push(`${file}: contributeUrl is not a valid URL`)
        }
      }

      // dependencies shape
      if (data.dependencies !== undefined) {
        if (!Array.isArray(data.dependencies)) {
          errors.push(`${file}: dependencies must be an array`)
        } else {
          for (const dep of data.dependencies) {
            if (typeof dep !== 'string' || dep.length === 0) {
              errors.push(`${file}: dependency must be a non-empty string`)
            }
          }
        }
      }

      // pdsHostnames shape
      if (data.pdsHostnames !== undefined) {
        if (!Array.isArray(data.pdsHostnames)) {
          errors.push(`${file}: pdsHostnames must be an array`)
        } else {
          for (const h of data.pdsHostnames) {
            if (typeof h !== 'string') {
              errors.push(`${file}: hostname must be a string`)
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      expect.fail(`Catalog validation errors:\n  ${errors.join('\n  ')}`)
    }
  })
})

// ---------------------------------------------------------------------------
// DID reverse index — lookups by DID find hostname-keyed entries
// ---------------------------------------------------------------------------

describe('catalog DID reverse index', () => {
  it('finds a catalog entry by its DID field', () => {
    // anisota.net has did:plc:lcieujcfkv4jx7gehsvok3pr and dependencies
    const result = lookupManualStewardRecord('did:plc:lcieujcfkv4jx7gehsvok3pr')
    expect(result).not.toBeNull()
    expect(result!.stewardUri).toBe('anisota.net')
    expect(result!.dependencies).toEqual(['dame.is', 'atpota.to'])
  })

  it('returns null for an unknown DID', () => {
    expect(lookupManualStewardRecord('did:plc:unknown000000000000')).toBeNull()
  })

  it('hostname lookup still works', () => {
    const result = lookupManualStewardRecord('anisota.net')
    expect(result).not.toBeNull()
    expect(result!.stewardUri).toBe('anisota.net')
  })
})

// ---------------------------------------------------------------------------
// Resolver catalog validation
// ---------------------------------------------------------------------------

describe('resolver-catalog.json', () => {
  const raw = readFileSync(RESOLVER_PATH, 'utf-8')
  const data = JSON.parse(raw) as { overrides: unknown[] }

  it('is valid JSON with overrides array', () => {
    expect(data).toHaveProperty('overrides')
    expect(Array.isArray(data.overrides)).toBe(true)
  })

  it('every override has matchPrefix or matchSuffix plus stewardUri', () => {
    const errors: string[] = []
    for (let i = 0; i < data.overrides.length; i++) {
      const e = data.overrides[i] as Record<string, unknown>
      const hasPrefix = typeof e.matchPrefix === 'string'
      const hasSuffix = typeof e.matchSuffix === 'string'
      if (!hasPrefix && !hasSuffix) {
        errors.push(`override[${i}]: must have matchPrefix or matchSuffix`)
      }
      if (typeof e.stewardUri !== 'string') {
        errors.push(`override[${i}]: must have stewardUri`)
      }
    }
    if (errors.length > 0) {
      expect.fail(`Resolver catalog errors:\n  ${errors.join('\n  ')}`)
    }
  })
})
