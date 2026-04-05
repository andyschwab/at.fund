import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { StewardEntry } from '@/lib/steward-model'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/identity', () => ({
  buildIdentity: vi.fn(({ ref, did }: { ref: string; did?: string }) => ({
    uri: ref,
    did,
    displayName: ref,
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
    uri: 'primary.com',
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
    expect(result[0].uri).toBe('dep.com')
    expect(result[0].tags).toEqual(['dependency'])
  })

  it('skips dependencies that are already known entries', async () => {
    const entries = [
      entry({ uri: 'primary.com', did: 'did:plc:primary', dependencies: ['primary.com'] }),
    ]

    const result = await resolveDependencies(entries)
    expect(result).toEqual([])
    expect(mockResolveRef).not.toHaveBeenCalled()
  })

  it('skips dependencies whose DID matches a known entry', async () => {
    const entries = [
      entry({ uri: 'primary.com', did: 'did:plc:primary', dependencies: ['did:plc:primary'] }),
    ]

    const result = await resolveDependencies(entries)
    expect(result).toEqual([])
  })

  it('resolves transitive dependencies (multi-level)', async () => {
    mockResolveRef.mockResolvedValue(undefined)
    mockFunding
      .mockResolvedValueOnce({
        source: 'fund.at',
        dependencies: ['deep.com'], // sub-dep discovered
      })
      .mockResolvedValueOnce({ source: 'unknown' })

    const result = await resolveDependencies([
      entry({ dependencies: ['dep.com'] }),
    ])

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.uri)).toEqual(['dep.com', 'deep.com'])
  })

  it('deduplicates dependencies across entries', async () => {
    mockFunding.mockResolvedValue({ source: 'unknown' })

    const entries = [
      entry({ uri: 'a.com', dependencies: ['shared.com'] }),
      entry({ uri: 'b.com', dependencies: ['shared.com'] }),
    ]

    const result = await resolveDependencies(entries)
    expect(result).toHaveLength(1)
    expect(result[0].uri).toBe('shared.com')
  })

  it('calls onReferenced callback for each resolved dep', async () => {
    mockFunding.mockResolvedValue({ source: 'unknown' })
    const onRef = vi.fn()

    await resolveDependencies(
      [entry({ dependencies: ['dep-a.com', 'dep-b.com'] })],
      onRef,
    )

    // Called once during resolution + potentially again after profile backfill
    expect(onRef).toHaveBeenCalled()
    const uris = onRef.mock.calls.map((c) => c[0].uri)
    expect(uris).toContain('dep-a.com')
    expect(uris).toContain('dep-b.com')
  })

  it('backfills profiles for entries with DID but no avatar', async () => {
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
    // buildIdentity mock returns the ref as handle if provided
    vi.mocked(await import('@/lib/identity')).buildIdentity.mockReturnValue({
      uri: 'dep.com',
      did: 'did:plc:dep',
      handle: 'existing.handle',
      displayName: 'dep.com',
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
