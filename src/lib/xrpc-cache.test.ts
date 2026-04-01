import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isCacheable,
  getCached,
  setCached,
  getInflight,
  setInflight,
  clearInflight,
  clearCache,
} from './xrpc-cache'

beforeEach(() => clearCache())

describe('isCacheable', () => {
  it('returns true for cacheable NSIDs', () => {
    expect(isCacheable('com.atproto.repo.describeRepo')).toBe(true)
    expect(isCacheable('com.atproto.identity.resolveIdentity')).toBe(true)
    expect(isCacheable('com.atproto.server.describeServer')).toBe(true)
  })

  it('returns false for non-cacheable NSIDs', () => {
    expect(isCacheable('app.bsky.graph.getFollows')).toBe(false)
    expect(isCacheable('app.bsky.actor.getProfile')).toBe(false)
  })
})

describe('cache', () => {
  const nsid = 'com.atproto.repo.describeRepo'
  const params = { repo: 'did:plc:abc123' }
  const value = { collections: ['app.bsky.feed.post'], handle: 'alice.test' }

  it('returns undefined on miss', () => {
    expect(getCached(nsid, params)).toBeUndefined()
  })

  it('returns cached value on hit', () => {
    setCached(nsid, params, value)
    expect(getCached(nsid, params)).toEqual(value)
  })

  it('evicts entries after TTL', () => {
    setCached(nsid, params, value)
    // Advance time past TTL
    vi.useFakeTimers()
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    expect(getCached(nsid, params)).toBeUndefined()
    vi.useRealTimers()
  })

  it('distinguishes different params', () => {
    const params2 = { repo: 'did:plc:other' }
    setCached(nsid, params, value)
    expect(getCached(nsid, params2)).toBeUndefined()
  })

  it('clearCache removes all entries', () => {
    setCached(nsid, params, value)
    clearCache()
    expect(getCached(nsid, params)).toBeUndefined()
  })
})

describe('singleflight', () => {
  const nsid = 'com.atproto.repo.describeRepo'
  const params = { repo: 'did:plc:abc123' }

  it('returns undefined when no request is in-flight', () => {
    expect(getInflight(nsid, params)).toBeUndefined()
  })

  it('returns the in-flight promise', () => {
    const promise = Promise.resolve({ handle: 'test' })
    setInflight(nsid, params, promise)
    expect(getInflight(nsid, params)).toBe(promise)
  })

  it('clears the in-flight entry', () => {
    setInflight(nsid, params, Promise.resolve({}))
    clearInflight(nsid, params)
    expect(getInflight(nsid, params)).toBeUndefined()
  })
})
