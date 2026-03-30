import { describe, it, expect } from 'vitest'
import { resolveStewardUri, lookupManualStewardRecord } from './catalog'

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

  // Resolver catalog overrides
  it('resolves chat.bsky.* to bsky.app', () => {
    expect(resolveStewardUri('chat.bsky.convo')).toBe('bsky.app')
    expect(resolveStewardUri('chat.bsky.actor')).toBe('bsky.app')
  })

  it('resolves tools.ozone.* to bsky.app', () => {
    expect(resolveStewardUri('tools.ozone.moderation')).toBe('bsky.app')
  })

  it('resolves fyi.unravel.frontpage.* to frontpage.fyi', () => {
    expect(resolveStewardUri('fyi.unravel.frontpage.post')).toBe('frontpage.fyi')
    expect(resolveStewardUri('fyi.unravel.frontpage.vote')).toBe('frontpage.fyi')
  })

  it('resolves popfeed collections to popfeed.social', () => {
    expect(resolveStewardUri('feed.popfeed.xyz')).toBe('popfeed.social')
    expect(resolveStewardUri('actor.popfeed.xyz')).toBe('popfeed.social')
  })

  it('resolves sprk collections to sprk.so', () => {
    expect(resolveStewardUri('feed.sprk.something')).toBe('sprk.so')
    expect(resolveStewardUri('actor.sprk.something')).toBe('sprk.so')
  })

  it('resolves community.lexicon.* to lexicon.community', () => {
    expect(resolveStewardUri('community.lexicon.calendar')).toBe('lexicon.community')
    expect(resolveStewardUri('community.lexicon.calendar.event')).toBe('lexicon.community')
  })

  it('resolves lexicon.community.* to lexicon.community', () => {
    expect(resolveStewardUri('lexicon.community.something')).toBe('lexicon.community')
  })

  // NSID hostname inference (3+ segments, no override match)
  it('infers hostname from 3-segment NSIDs', () => {
    // NSID like "com.example.app" → "example.com"
    expect(resolveStewardUri('com.example.app')).toBe('example.com')
  })

  it('infers hostname from deep NSIDs', () => {
    // NSID like "io.github.myapp.feature" → "github.io"
    expect(resolveStewardUri('io.github.myapp.feature')).toBe('github.io')
  })

  // 2-segment inputs (treated as domain)
  it('handles 2-segment inputs as domains', () => {
    expect(resolveStewardUri('example.com')).toBe('example.com')
    expect(resolveStewardUri('bsky.app')).toBe('bsky.app')
  })
})

describe('lookupManualStewardRecord', () => {
  it('returns null for unknown steward URIs', () => {
    expect(lookupManualStewardRecord('nonexistent.example.com')).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(lookupManualStewardRecord('')).toBeNull()
  })

  it('finds bsky.app in the manual catalog', () => {
    const record = lookupManualStewardRecord('bsky.app')
    expect(record).not.toBeNull()
    expect(record!.stewardUri).toBe('bsky.app')
    expect(record!.displayName).toBeTruthy()
    expect(record!.links).toBeInstanceOf(Array)
  })

  it('is case-insensitive', () => {
    const lower = lookupManualStewardRecord('bsky.app')
    const upper = lookupManualStewardRecord('Bsky.App')
    expect(lower).toEqual(upper)
  })

  it('returns structured data with expected fields', () => {
    const record = lookupManualStewardRecord('bsky.app')
    if (!record) throw new Error('Expected bsky.app to be in manual catalog')
    expect(record).toHaveProperty('stewardUri')
    expect(record).toHaveProperty('displayName')
    expect(record).toHaveProperty('links')
    // links should be FundLink[] shape
    for (const link of record.links) {
      expect(link).toHaveProperty('label')
      expect(link).toHaveProperty('url')
      expect(typeof link.label).toBe('string')
      expect(typeof link.url).toBe('string')
    }
  })
})
