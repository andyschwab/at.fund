import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

const CATALOG_DIR = join(__dirname, 'catalog')
const RESOLVER_PATH = join(__dirname, 'resolver-catalog.json')

// ---------------------------------------------------------------------------
// Catalog entry validation
// ---------------------------------------------------------------------------

describe('catalog entries', () => {
  const files = readdirSync(CATALOG_DIR).filter((f) => f.endsWith('.json'))

  it('catalog directory has entries', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    describe(file, () => {
      const raw = readFileSync(join(CATALOG_DIR, file), 'utf-8')
      let data: Record<string, unknown>

      it('is valid JSON', () => {
        data = JSON.parse(raw)
        expect(typeof data).toBe('object')
        expect(data).not.toBeNull()
      })

      it('has no unknown top-level keys', () => {
        data ??= JSON.parse(raw)
        const allowed = new Set([
          'contributeUrl',
          'dependencies',
          'tags',
          'atprotoHandle',
          'pdsHostnames',
        ])
        for (const key of Object.keys(data)) {
          expect(allowed.has(key), `unexpected key "${key}" in ${file}`).toBe(true)
        }
      })

      it('contributeUrl is a valid https/http URL if present', () => {
        data ??= JSON.parse(raw)
        if (typeof data.contributeUrl === 'string') {
          const url = new URL(data.contributeUrl)
          expect(
            url.protocol === 'https:' || url.protocol === 'http:',
            `contributeUrl must be http(s) in ${file}`,
          ).toBe(true)
        }
      })

      it('dependencies is an array of strings if present', () => {
        data ??= JSON.parse(raw)
        if (data.dependencies !== undefined) {
          expect(Array.isArray(data.dependencies), `dependencies must be array in ${file}`).toBe(true)
          for (const dep of data.dependencies as unknown[]) {
            expect(typeof dep, `dependency must be string in ${file}`).toBe('string')
            expect((dep as string).length > 0, `empty dependency in ${file}`).toBe(true)
          }
        }
      })

      it('pdsHostnames is an array of strings if present', () => {
        data ??= JSON.parse(raw)
        if (data.pdsHostnames !== undefined) {
          expect(Array.isArray(data.pdsHostnames), `pdsHostnames must be array in ${file}`).toBe(true)
          for (const h of data.pdsHostnames as unknown[]) {
            expect(typeof h, `hostname must be string in ${file}`).toBe('string')
          }
        }
      })
    })
  }
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

  it('each override has matchPrefix or matchSuffix plus stewardUri', () => {
    for (const entry of data.overrides) {
      const e = entry as Record<string, unknown>
      const hasPrefix = typeof e.matchPrefix === 'string'
      const hasSuffix = typeof e.matchSuffix === 'string'
      expect(hasPrefix || hasSuffix, `override must have matchPrefix or matchSuffix`).toBe(true)
      expect(typeof e.stewardUri, `override must have stewardUri`).toBe('string')
    }
  })
})
