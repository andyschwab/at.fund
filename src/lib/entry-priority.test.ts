import { describe, it, expect } from 'vitest'
import { entryPriority } from './entry-priority'
import type { StewardEntry } from '@/lib/steward-model'

function entry(overrides: Partial<StewardEntry> = {}): StewardEntry {
  return {
    uri: 'example.com',
    displayName: 'Example',
    source: 'manual',
    tags: ['tool'],
    ...overrides,
  }
}

describe('entryPriority', () => {
  it('returns 5 for undefined entry', () => {
    expect(entryPriority(undefined)).toBe(5)
  })

  it('returns 0 when entry has a contributeUrl', () => {
    expect(entryPriority(entry({ contributeUrl: 'https://donate.example.com' }))).toBe(0)
  })

  it('returns 1 when a direct dependency is fundable (1-hop)', () => {
    const e = entry({ dependencies: ['dep.com'] })
    const lookup = (uri: string) =>
      uri === 'dep.com' ? entry({ uri: 'dep.com', contributeUrl: 'https://donate.dep.com' }) : undefined
    expect(entryPriority(e, lookup)).toBe(1)
  })

  it('returns 2 when a dependency\'s dependency is fundable (2-hop)', () => {
    const e = entry({ dependencies: ['dep.com'] })
    const lookup = (uri: string) => {
      if (uri === 'dep.com') return entry({ uri: 'dep.com', dependencies: ['deep.com'] })
      if (uri === 'deep.com') return entry({ uri: 'deep.com', contributeUrl: 'https://donate.deep.com' })
      return undefined
    }
    expect(entryPriority(e, lookup)).toBe(2)
  })

  it('returns 3 when dependencies exist but none are fundable', () => {
    const e = entry({ dependencies: ['dep.com'] })
    const lookup = (uri: string) =>
      uri === 'dep.com' ? entry({ uri: 'dep.com' }) : undefined
    expect(entryPriority(e, lookup)).toBe(3)
  })

  it('returns 3 when dependencies exist but no lookup is provided', () => {
    const e = entry({ dependencies: ['dep.com'] })
    expect(entryPriority(e)).toBe(3)
  })

  it('returns 4 for a known entry with no dependencies and no contributeUrl', () => {
    expect(entryPriority(entry())).toBe(4)
  })

  it('returns 5 for unknown source with no funding data', () => {
    expect(entryPriority(entry({ source: 'unknown' }))).toBe(5)
  })

  it('prefers contributeUrl over dependencies (tier 0 beats tier 1)', () => {
    const e = entry({ contributeUrl: 'https://donate.example.com', dependencies: ['dep.com'] })
    const lookup = (uri: string) =>
      uri === 'dep.com' ? entry({ uri: 'dep.com', contributeUrl: 'https://donate.dep.com' }) : undefined
    expect(entryPriority(e, lookup)).toBe(0)
  })
})
