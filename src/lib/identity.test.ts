import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/atfund-dns', () => ({
  lookupAtprotoDid: vi.fn(),
}))

vi.mock('@/lib/fund-at-records', () => ({
  resolveDidFromIdentifier: vi.fn(),
}))

vi.mock('@/lib/xrpc', () => ({
  xrpcQuery: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { batchFetchProfiles, resolveRefToDid } from './identity'
import { buildIdentity, isHumanReadableName } from '@/lib/steward-model'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { resolveDidFromIdentifier } from '@/lib/fund-at-records'
import { xrpcQuery } from '@/lib/xrpc'

const mockDns = vi.mocked(lookupAtprotoDid)
const mockResolveHandle = vi.mocked(resolveDidFromIdentifier)
const mockXrpc = vi.mocked(xrpcQuery)

// ---------------------------------------------------------------------------
// isHumanReadableName (pure, from steward-model)
// ---------------------------------------------------------------------------

describe('isHumanReadableName', () => {
  it('returns true for normal display names', () => {
    expect(isHumanReadableName('Alice')).toBe(true)
    expect(isHumanReadableName('Bluesky Social')).toBe(true)
    expect(isHumanReadableName('example.com')).toBe(true)
  })

  it('returns false for DID strings', () => {
    expect(isHumanReadableName('did:plc:abc123')).toBe(false)
    expect(isHumanReadableName('did:web:example.com')).toBe(false)
  })

  it('returns false for empty/null/undefined', () => {
    expect(isHumanReadableName('')).toBe(false)
    expect(isHumanReadableName(null)).toBe(false)
    expect(isHumanReadableName(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// buildIdentity (pure, from steward-model)
// ---------------------------------------------------------------------------

describe('buildIdentity', () => {
  it('uses hostname as URI for tools', () => {
    const id = buildIdentity({ ref: 'example.com', did: 'did:plc:abc', isTool: true })
    expect(id.uri).toBe('example.com')
  })

  it('uses handle as URI for non-tools', () => {
    const id = buildIdentity({ ref: 'example.com', did: 'did:plc:abc', handle: 'alice.bsky.social' })
    expect(id.uri).toBe('alice.bsky.social')
  })

  it('falls back to DID when no handle', () => {
    const id = buildIdentity({ ref: 'did:plc:abc', did: 'did:plc:abc' })
    expect(id.uri).toBe('did:plc:abc')
  })

  it('uses profile displayName when human-readable', () => {
    const id = buildIdentity({ ref: 'example.com', displayName: 'Alice' })
    expect(id.displayName).toBe('Alice')
  })

  it('falls back displayName to hostname for tools', () => {
    const id = buildIdentity({ ref: 'example.com', isTool: true, displayName: 'did:plc:abc' })
    expect(id.displayName).toBe('example.com')
  })

  it('falls back displayName to handle when name is DID-like', () => {
    const id = buildIdentity({ ref: 'did:plc:abc', handle: 'alice.bsky.social', displayName: 'did:plc:abc' })
    expect(id.displayName).toBe('alice.bsky.social')
  })

  it('generates landingPage for non-tools with a handle', () => {
    const id = buildIdentity({ ref: 'some.ref', handle: 'alice.bsky.social' })
    expect(id.landingPage).toBe('https://bsky.app/profile/alice.bsky.social')
  })

  it('does not generate landingPage for tools', () => {
    const id = buildIdentity({ ref: 'example.com', handle: 'alice.bsky.social', isTool: true })
    expect(id.landingPage).toBeUndefined()
  })

  it('does not generate landingPage without handle', () => {
    const id = buildIdentity({ ref: 'example.com' })
    expect(id.landingPage).toBeUndefined()
  })

  it('passes through optional fields', () => {
    const id = buildIdentity({
      ref: 'example.com',
      did: 'did:plc:abc',
      description: 'A cool project',
      avatar: 'https://cdn.example.com/avatar.jpg',
    })
    expect(id.did).toBe('did:plc:abc')
    expect(id.description).toBe('A cool project')
    expect(id.avatar).toBe('https://cdn.example.com/avatar.jpg')
  })
})

// ---------------------------------------------------------------------------
// batchFetchProfiles
// ---------------------------------------------------------------------------

describe('batchFetchProfiles', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns empty map for empty input', async () => {
    const result = await batchFetchProfiles([])
    expect(result.size).toBe(0)
    expect(mockXrpc).not.toHaveBeenCalled()
  })

  it('fetches profiles and returns a map keyed by DID', async () => {
    mockXrpc.mockResolvedValue({
      profiles: [
        { did: 'did:plc:aaa', handle: 'alice.bsky.social', displayName: 'Alice' },
        { did: 'did:plc:bbb', handle: 'bob.bsky.social', displayName: 'Bob' },
      ],
    })

    const result = await batchFetchProfiles(['did:plc:aaa', 'did:plc:bbb'])
    expect(result.size).toBe(2)
    expect(result.get('did:plc:aaa')?.displayName).toBe('Alice')
    expect(result.get('did:plc:bbb')?.displayName).toBe('Bob')
  })

  it('batches requests at PROFILE_BATCH size', async () => {
    // Create 30 DIDs — should make 2 batches (25 + 5)
    const dids = Array.from({ length: 30 }, (_, i) => `did:plc:${i}`)
    mockXrpc
      .mockResolvedValueOnce({ profiles: dids.slice(0, 25).map(d => ({ did: d })) })
      .mockResolvedValueOnce({ profiles: dids.slice(25).map(d => ({ did: d })) })

    const result = await batchFetchProfiles(dids)
    expect(mockXrpc).toHaveBeenCalledTimes(2)
    expect(result.size).toBe(30)
  })

  it('continues on batch failure (partial results)', async () => {
    mockXrpc
      .mockRejectedValueOnce(new Error('batch 1 failed'))
      .mockResolvedValueOnce({
        profiles: [{ did: 'did:plc:26', handle: 'ok.bsky.social' }],
      })

    const dids = Array.from({ length: 30 }, (_, i) => `did:plc:${i}`)
    const result = await batchFetchProfiles(dids)
    // First batch failed, second succeeded with 1 profile
    expect(result.size).toBe(1)
    expect(result.has('did:plc:26')).toBe(true)
  })

  it('handles empty profiles response', async () => {
    mockXrpc.mockResolvedValue({ profiles: [] })

    const result = await batchFetchProfiles(['did:plc:aaa'])
    expect(result.size).toBe(0)
  })

  it('handles undefined profiles field', async () => {
    mockXrpc.mockResolvedValue({})

    const result = await batchFetchProfiles(['did:plc:aaa'])
    expect(result.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// resolveRefToDid
// ---------------------------------------------------------------------------

describe('resolveRefToDid', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns DID strings as-is', async () => {
    const result = await resolveRefToDid('did:plc:abc123')
    expect(result).toBe('did:plc:abc123')
    expect(mockResolveHandle).not.toHaveBeenCalled()
    expect(mockDns).not.toHaveBeenCalled()
  })

  it('resolves handles via resolveDidFromIdentifier', async () => {
    mockResolveHandle.mockResolvedValue('did:plc:resolved')

    const result = await resolveRefToDid('alice.bsky.social')
    expect(result).toBe('did:plc:resolved')
    expect(mockDns).not.toHaveBeenCalled() // should not fall through to DNS
  })

  it('falls back to DNS when handle resolution fails', async () => {
    mockResolveHandle.mockRejectedValue(new Error('not found'))
    mockDns.mockResolvedValue('did:plc:dns-resolved')

    const result = await resolveRefToDid('example.com')
    expect(result).toBe('did:plc:dns-resolved')
  })

  it('falls back to DNS when handle resolution returns undefined/null', async () => {
    mockResolveHandle.mockResolvedValue(undefined)
    mockDns.mockResolvedValue('did:plc:dns-resolved')

    const result = await resolveRefToDid('example.com')
    expect(result).toBe('did:plc:dns-resolved')
  })

  it('returns undefined when both resolution paths fail', async () => {
    mockResolveHandle.mockRejectedValue(new Error('not found'))
    mockDns.mockRejectedValue(new Error('no DNS'))

    const result = await resolveRefToDid('unknown.example.com')
    expect(result).toBeUndefined()
  })

  it('returns undefined when both return null/undefined', async () => {
    mockResolveHandle.mockResolvedValue(undefined)
    mockDns.mockResolvedValue(null)

    const result = await resolveRefToDid('unknown.example.com')
    expect(result).toBeUndefined()
  })
})
