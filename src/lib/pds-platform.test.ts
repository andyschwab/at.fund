import { describe, it, expect } from 'vitest'
import { summarizePlatforms, type PdsPlatformFingerprint } from './pds-platform'

describe('summarizePlatforms', () => {
  it('counts platforms correctly', () => {
    const fingerprints: PdsPlatformFingerprint[] = [
      { hostname: 'a.com', platform: 'atproto' },
      { hostname: 'b.com', platform: 'atproto' },
      { hostname: 'c.com', platform: 'picopds' },
      { hostname: 'd.com', platform: 'atproto' },
      { hostname: 'e.com', platform: 'unknown' },
    ]
    const result = summarizePlatforms(fingerprints)
    expect(result).toEqual([
      { platform: 'atproto', count: 3 },
      { platform: 'picopds', count: 1 },
      { platform: 'unknown', count: 1 },
    ])
  })

  it('sorts by count descending, then alphabetically', () => {
    const fingerprints: PdsPlatformFingerprint[] = [
      { hostname: 'a.com', platform: 'beta' },
      { hostname: 'b.com', platform: 'alpha' },
      { hostname: 'c.com', platform: 'beta' },
      { hostname: 'd.com', platform: 'alpha' },
    ]
    const result = summarizePlatforms(fingerprints)
    expect(result).toEqual([
      { platform: 'alpha', count: 2 },
      { platform: 'beta', count: 2 },
    ])
  })

  it('handles empty input', () => {
    expect(summarizePlatforms([])).toEqual([])
  })
})
