import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the Redis client before importing the module under test
const mockRedisGet = vi.fn()
const mockRedisSet = vi.fn()
const mockRedisDel = vi.fn()

vi.mock('@/lib/auth/kv-store', () => ({
  getRedisClient: () => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
  }),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import {
  identityGet,
  identitySet,
  identityDelete,
  clearIdentityCache,
} from './identity-cache'

beforeEach(() => {
  clearIdentityCache()
  vi.resetAllMocks()
  mockRedisSet.mockResolvedValue('OK')
  mockRedisDel.mockResolvedValue(1)
})

describe('identityGet', () => {
  it('returns undefined on complete miss', async () => {
    mockRedisGet.mockResolvedValue(null)
    expect(await identityGet('handleToDid', 'alice.test')).toBeUndefined()
  })

  it('returns L1 hit without touching Redis', async () => {
    identitySet('handleToDid', 'alice.test', 'did:plc:alice')
    const result = await identityGet<string>('handleToDid', 'alice.test')
    expect(result).toBe('did:plc:alice')
    expect(mockRedisGet).not.toHaveBeenCalled()
  })

  it('returns L2 hit and backfills L1', async () => {
    mockRedisGet.mockResolvedValue('did:plc:bob')

    // First call — L1 miss, L2 hit
    const result = await identityGet<string>('handleToDid', 'bob.test')
    expect(result).toBe('did:plc:bob')
    expect(mockRedisGet).toHaveBeenCalledTimes(1)

    // Second call — L1 hit (backfilled), no Redis call
    mockRedisGet.mockClear()
    const result2 = await identityGet<string>('handleToDid', 'bob.test')
    expect(result2).toBe('did:plc:bob')
    expect(mockRedisGet).not.toHaveBeenCalled()
  })

  it('caches null values (negative cache)', async () => {
    identitySet('hostnameToDid', 'unknown.example', null as unknown as string)
    mockRedisGet.mockResolvedValue(null)

    // null was stored — the get should not hit Redis because L1 has the entry.
    // But identityGet checks `!== undefined`, and null is a valid stored value.
    // We need to verify null values round-trip correctly.
    const result = await identityGet<string | null>('hostnameToDid', 'unknown.example')
    expect(result).toBeNull()
    expect(mockRedisGet).not.toHaveBeenCalled()
  })

  it('handles Redis errors gracefully', async () => {
    mockRedisGet.mockRejectedValue(new Error('connection refused'))
    const result = await identityGet('handleToDid', 'alice.test')
    expect(result).toBeUndefined()
  })

  it('isolates namespaces', async () => {
    identitySet('handleToDid', 'alice.test', 'did:plc:alice')
    mockRedisGet.mockResolvedValue(null)

    // Same key, different namespace — should miss
    const result = await identityGet('hostnameToDid', 'alice.test')
    expect(result).toBeUndefined()
  })
})

describe('identitySet', () => {
  it('writes to Redis with 7-day TTL', () => {
    identitySet('handleToDid', 'alice.test', 'did:plc:alice')
    expect(mockRedisSet).toHaveBeenCalledWith(
      'id:h2d:alice.test',
      'did:plc:alice',
      { ex: 7 * 24 * 60 * 60 },
    )
  })

  it('uses correct Redis key prefix per namespace', () => {
    identitySet('didToDoc', 'did:plc:abc', { id: 'did:plc:abc' })
    expect(mockRedisSet).toHaveBeenCalledWith(
      'id:d2doc:did:plc:abc',
      { id: 'did:plc:abc' },
      expect.any(Object),
    )

    identitySet('didToPds', 'did:plc:abc', 'https://pds.example.com')
    expect(mockRedisSet).toHaveBeenCalledWith(
      'id:d2pds:did:plc:abc',
      'https://pds.example.com',
      expect.any(Object),
    )
  })

  it('handles Redis write errors gracefully (fire-and-forget)', async () => {
    mockRedisSet.mockRejectedValue(new Error('write timeout'))
    // Should not throw
    identitySet('handleToDid', 'alice.test', 'did:plc:alice')
    // L1 should still be populated despite Redis failure
    const result = await identityGet<string>('handleToDid', 'alice.test')
    expect(result).toBe('did:plc:alice')
  })
})

describe('identityDelete', () => {
  it('removes from L1 and Redis', async () => {
    identitySet('handleToDid', 'alice.test', 'did:plc:alice')
    identityDelete('handleToDid', 'alice.test')

    // L1 should be cleared
    mockRedisGet.mockResolvedValue(null)
    const result = await identityGet('handleToDid', 'alice.test')
    expect(result).toBeUndefined()

    // Redis del should have been called
    expect(mockRedisDel).toHaveBeenCalledWith('id:h2d:alice.test')
  })
})

describe('L1 TTL expiry', () => {
  it('evicts L1 entries after 30 minutes', async () => {
    vi.useFakeTimers()
    identitySet('handleToDid', 'alice.test', 'did:plc:alice')

    // Still valid within TTL
    const result1 = await identityGet<string>('handleToDid', 'alice.test')
    expect(result1).toBe('did:plc:alice')

    // Advance past L1 TTL (30 min)
    vi.advanceTimersByTime(30 * 60 * 1000 + 1)

    // L1 expired — should fall through to Redis
    mockRedisGet.mockResolvedValue('did:plc:alice')
    const result2 = await identityGet<string>('handleToDid', 'alice.test')
    expect(result2).toBe('did:plc:alice')
    expect(mockRedisGet).toHaveBeenCalled()

    vi.useRealTimers()
  })
})

describe('clearIdentityCache', () => {
  it('clears all L1 caches', async () => {
    identitySet('handleToDid', 'alice.test', 'did:plc:alice')
    identitySet('hostnameToDid', 'climb:example.com', 'did:plc:example')

    clearIdentityCache()

    mockRedisGet.mockResolvedValue(null)
    expect(await identityGet('handleToDid', 'alice.test')).toBeUndefined()
    expect(await identityGet('hostnameToDid', 'climb:example.com')).toBeUndefined()
  })
})
