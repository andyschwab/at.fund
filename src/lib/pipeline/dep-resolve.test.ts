import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StewardEntry } from '@/lib/steward-model'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/identity', () => ({
  buildIdentity: vi.fn(({ did }: { did: string }) => ({
    uri: did,
    did,
    displayName: did,
  })),
  resolveRefToDid: vi.fn(),
  batchFetchProfiles: vi.fn(),
}))

vi.mock('@/lib/funding', () => ({
  resolveFundingForDep: vi.fn(),
}))

import { resolveDependencies } from './dep-resolve'
import { resolveRefToDid, batchFetchProfiles } from '@/lib/identity'
import { resolveFundingForDep } from '@/lib/funding'

const mockResolveRef = vi.mocked(resolveRefToDid)
const mockFunding = vi.mocked(resolveFundingForDep)
const mockProfiles = vi.mocked(batchFetchProfiles)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function entry(overrides: Partial<StewardEntry> = {}): StewardEntry {
  return {
    uri: 'did:plc:primary',
    did: 'did:plc:primary',
    displayName: 'Primary',
    source: 'fund.at',
    tags: ['tool'],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveDependencies', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockResolveRef.mockResolvedValue(undefined)
    mockFunding.mockResolvedValue({ source: 'unknown' })
    mockProfiles.mockResolvedValue(new Map())
  })

  it('returns empty array when entries have no dependencies', async () => {
    const result = await resolveDependencies([entry()])
    expect(result).toEqual([])
    expect(mockResolveRef).not.toHaveBeenCalled()
  })

  it('resolves a single dependency', async () => {
    mockResolveRef.mockResolvedValue('did:plc:dep')
    mockFunding.mockResolvedValue({
      source: 'fund.at',
      contributeUrl: 'https://donate.dep.com',
    })

    const result = await resolveDependencies([
      entry({ dependencies: ['dep.com'] }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0].did).toBe('did:plc:dep')
    expect(result[0].tags).toEqual(['dependency'])
  })

  it('skips dependencies that are already known entries (by DID)', async () => {
    const entries = [
      entry({ did: 'did:plc:primary', dependencies: ['did:plc:primary'] }),
    ]

    const result = await resolveDependencies(entries)
    expect(result).toEqual([])
    expect(mockResolveRef).not.toHaveBeenCalled()
  })

  it('skips dependencies that cannot resolve to a DID', async () => {
    mockResolveRef.mockResolvedValue(undefined)

    const result = await resolveDependencies([
      entry({ dependencies: ['unknown.com'] }),
    ])

    expect(result).toEqual([])
  })

  it('resolves transitive dependencies (multi-level)', async () => {
    mockResolveRef
      .mockResolvedValueOnce('did:plc:dep')
      .mockResolvedValueOnce('did:plc:deep')
    mockFunding
      .mockResolvedValueOnce({
        source: 'fund.at',
        dependencies: ['deep.com'],
      })
      .mockResolvedValueOnce({ source: 'unknown' })

    const result = await resolveDependencies([
      entry({ dependencies: ['dep.com'] }),
    ])

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.did)).toEqual(['did:plc:dep', 'did:plc:deep'])
  })

  it('deduplicates dependencies across entries', async () => {
    mockResolveRef.mockResolvedValue('did:plc:shared')
    mockFunding.mockResolvedValue({ source: 'unknown' })

    const entries = [
      entry({ uri: 'did:plc:a', did: 'did:plc:a', dependencies: ['shared.com'] }),
      entry({ uri: 'did:plc:b', did: 'did:plc:b', dependencies: ['shared.com'] }),
    ]

    const result = await resolveDependencies(entries)
    expect(result).toHaveLength(1)
    expect(result[0].did).toBe('did:plc:shared')
  })

  it('calls onReferenced callback for each resolved dep', async () => {
    mockResolveRef
      .mockResolvedValueOnce('did:plc:dep-a')
      .mockResolvedValueOnce('did:plc:dep-b')
    mockFunding.mockResolvedValue({ source: 'unknown' })
    const onRef = vi.fn()

    await resolveDependencies(
      [entry({ dependencies: ['dep-a.com', 'dep-b.com'] })],
      onRef,
    )

    expect(onRef).toHaveBeenCalled()
    const dids = onRef.mock.calls.map((c) => c[0].did)
    expect(dids).toContain('did:plc:dep-a')
    expect(dids).toContain('did:plc:dep-b')
  })

  it('backfills profiles for entries without avatar', async () => {
    mockResolveRef.mockResolvedValue('did:plc:dep')
    mockFunding.mockResolvedValue({ source: 'unknown' })
    mockProfiles.mockResolvedValue(
      new Map([
        ['did:plc:dep', {
          did: 'did:plc:dep',
          handle: 'dep.bsky.social',
          displayName: 'Dep Project',
          avatar: 'https://cdn.example.com/avatar.jpg',
        }],
      ]),
    )

    const result = await resolveDependencies([
      entry({ dependencies: ['dep.com'] }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0].avatar).toBe('https://cdn.example.com/avatar.jpg')
    expect(result[0].handle).toBe('dep.bsky.social')
    expect(result[0].landingPage).toBe('https://bsky.app/profile/dep.bsky.social')
  })

  it('does not overwrite existing handle during profile backfill', async () => {
    vi.mocked(await import('@/lib/identity')).buildIdentity.mockReturnValue({
      uri: 'did:plc:dep',
      did: 'did:plc:dep',
      handle: 'existing.handle',
      displayName: 'did:plc:dep',
    })
    mockResolveRef.mockResolvedValue('did:plc:dep')
    mockFunding.mockResolvedValue({ source: 'unknown' })
    mockProfiles.mockResolvedValue(
      new Map([
        ['did:plc:dep', {
          did: 'did:plc:dep',
          handle: 'new.handle',
          avatar: 'https://cdn.example.com/avatar.jpg',
        }],
      ]),
    )

    const result = await resolveDependencies([
      entry({ dependencies: ['dep.com'] }),
    ])

    expect(result[0].handle).toBe('existing.handle')
  })
})
