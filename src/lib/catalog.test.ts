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

  it('infers hostname from NSID-like popfeed collections', () => {
    // Without a resolver override, NSID inference reverses the first two segments
    expect(resolveStewardUri('feed.popfeed.xyz')).toBe('popfeed.feed')
    expect(resolveStewardUri('actor.popfeed.xyz')).toBe('popfeed.actor')
  })

  it('infers hostname from community.lexicon.* NSIDs', () => {
    // community.lexicon.* naturally reverses to lexicon.community
    expect(resolveStewardUri('community.lexicon.calendar')).toBe('lexicon.community')
    expect(resolveStewardUri('community.lexicon.calendar.event')).toBe('lexicon.community')
  })

  // NSID hostname inference (3+ segments, no override match)
  it('infers hostname from 3-segment NSIDs', () => {
    expect(resolveStewardUri('com.example.app')).toBe('example.com')
  })

  it('infers hostname from deep NSIDs', () => {
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

  it('returns record for stewards with pdsHostnames but no contribute/dependency data', () => {
    // bsky.app has a catalog entry with pdsHostnames (counts as content)
    const record = lookupManualStewardRecord('bsky.app')
    expect(record).not.toBeNull()
    expect(record!.pdsHostnames).toContain('bsky.social')
    expect(record!.contributeUrl).toBeUndefined()
  })

  it('finds deck.blue in the manual catalog with contributeUrl', () => {
    const record = lookupManualStewardRecord('deck.blue')
    expect(record).not.toBeNull()
    expect(record!.stewardUri).toBe('deck.blue')
    expect(record!.contributeUrl).toBeTruthy()
  })

  it('finds frontpage.fyi in the manual catalog with dependencies', () => {
    const record = lookupManualStewardRecord('frontpage.fyi')
    expect(record).not.toBeNull()
    expect(record!.stewardUri).toBe('frontpage.fyi')
    expect(record!.dependencies).toBeInstanceOf(Array)
    expect(record!.dependencies!.length).toBeGreaterThan(0)
  })

  it('is case-insensitive', () => {
    const lower = lookupManualStewardRecord('deck.blue')
    const upper = lookupManualStewardRecord('Deck.Blue')
    expect(lower).toEqual(upper)
  })

  it('returns structured data with expected fields', () => {
    const record = lookupManualStewardRecord('deck.blue')
    if (!record) throw new Error('Expected deck.blue to be in manual catalog')
    expect(record).toHaveProperty('stewardUri')
    expect(record).toHaveProperty('contributeUrl')
    expect(typeof record.contributeUrl).toBe('string')
  })
})
