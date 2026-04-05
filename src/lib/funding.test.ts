import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Identity } from '@/lib/steward-model'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/catalog', () => ({
  lookupManualStewardRecord: vi.fn(),
}))

vi.mock('@/lib/steward-funding', () => ({
  fetchFundAtForStewardDid: vi.fn(),
}))

vi.mock('@/lib/fund-at-records', () => ({
  fetchOwnFundAtRecords: vi.fn(),
  fetchFundAtRecords: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}))

import { lookupManualByIdentity, resolveFunding, resolveFundingForDep } from './funding'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { fetchFundAtRecords } from '@/lib/fund-at-records'

const mockCatalog = vi.mocked(lookupManualStewardRecord)
const mockFetchFundAt = vi.mocked(fetchFundAtForStewardDid)
const mockFetchRecords = vi.mocked(fetchFundAtRecords)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    uri: 'example.com',
    displayName: 'Example',
    did: 'did:plc:abc123',
    handle: 'example.bsky.social',
    ...overrides,
  }
}

function manualRecord(overrides: Record<string, unknown> = {}) {
  return { stewardUri: 'example.com', ...overrides }
}

// ---------------------------------------------------------------------------
// lookupManualByIdentity
// ---------------------------------------------------------------------------

describe('lookupManualByIdentity', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('looks up by DID first', () => {
    const record = manualRecord({ contributeUrl: 'https://donate.example.com' })
    mockCatalog.mockReturnValueOnce(record)

    const result = lookupManualByIdentity(identity())
    expect(result).toBe(record)
    expect(mockCatalog).toHaveBeenCalledWith('did:plc:abc123')
  })

  it('falls back to URI when DID has no match', () => {
    const record = manualRecord({ contributeUrl: 'https://donate.example.com' })
    mockCatalog.mockReturnValueOnce(null) // DID miss
    mockCatalog.mockReturnValueOnce(record) // URI hit

    const result = lookupManualByIdentity(identity())
    expect(result).toBe(record)
    expect(mockCatalog).toHaveBeenCalledWith('example.com')
  })

  it('falls back to handle when DID and URI miss', () => {
    const record = manualRecord({ contributeUrl: 'https://donate.example.com' })
    mockCatalog.mockReturnValueOnce(null) // DID
    mockCatalog.mockReturnValueOnce(null) // URI
    mockCatalog.mockReturnValueOnce(record) // handle

    const result = lookupManualByIdentity(identity())
    expect(result).toBe(record)
    expect(mockCatalog).toHaveBeenCalledWith('example.bsky.social')
  })

  it('tries extra keys after standard keys', () => {
    const record = manualRecord({ contributeUrl: 'https://donate.example.com' })
    mockCatalog.mockReturnValueOnce(null) // DID
    mockCatalog.mockReturnValueOnce(null) // URI
    mockCatalog.mockReturnValueOnce(null) // handle
    mockCatalog.mockReturnValueOnce(record) // extra key

    const result = lookupManualByIdentity(identity(), ['extra.example.com'])
    expect(result).toBe(record)
    expect(mockCatalog).toHaveBeenCalledWith('extra.example.com')
  })

  it('returns null when no key matches', () => {
    mockCatalog.mockReturnValue(null)

    const result = lookupManualByIdentity(identity())
    expect(result).toBeNull()
  })

  it('skips URI lookup when URI equals DID', () => {
    mockCatalog.mockReturnValue(null)

    lookupManualByIdentity(identity({ uri: 'did:plc:abc123', did: 'did:plc:abc123' }))
    // DID lookup + handle lookup = 2 calls (URI skipped because it equals DID)
    expect(mockCatalog).toHaveBeenCalledTimes(2)
  })

  it('skips DID lookup when DID is undefined', () => {
    mockCatalog.mockReturnValue(null)

    lookupManualByIdentity(identity({ did: undefined }))
    // URI + handle = 2 calls (DID skipped)
    expect(mockCatalog).toHaveBeenCalledTimes(2)
  })
})

// ---------------------------------------------------------------------------
// resolveFunding
// ---------------------------------------------------------------------------

describe('resolveFunding', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns fund.at source when PDS has records', async () => {
    mockFetchFundAt.mockResolvedValue({
      stewardDid: 'did:plc:abc123',
      contributeUrl: 'https://donate.example.com',
      dependencies: [{ uri: 'dep.example.com' }],
    })
    mockCatalog.mockReturnValue(null)

    const result = await resolveFunding(identity())
    expect(result.funding.source).toBe('fund.at')
    expect(result.funding.contributeUrl).toBe('https://donate.example.com')
    expect(result.funding.dependencies).toContain('dep.example.com')
    expect(result.warning).toBeUndefined()
  })

  it('merges manual catalog dependencies with fund.at records', async () => {
    mockFetchFundAt.mockResolvedValue({
      stewardDid: 'did:plc:abc123',
      contributeUrl: 'https://donate.example.com',
      dependencies: [{ uri: 'dep-a.com' }],
    })
    mockCatalog.mockReturnValueOnce(manualRecord({ dependencies: ['dep-b.com'] }))

    const result = await resolveFunding(identity())
    expect(result.funding.source).toBe('fund.at')
    expect(result.funding.dependencies).toContain('dep-a.com')
    expect(result.funding.dependencies).toContain('dep-b.com')
  })

  it('uses manual contributeUrl as fallback when fund.at has none', async () => {
    mockFetchFundAt.mockResolvedValue({
      stewardDid: 'did:plc:abc123',
      contributeUrl: undefined,
      dependencies: [{ uri: 'dep.com' }],
    })
    mockCatalog.mockReturnValueOnce(manualRecord({ contributeUrl: 'https://manual-donate.com' }))

    const result = await resolveFunding(identity())
    expect(result.funding.source).toBe('fund.at')
    expect(result.funding.contributeUrl).toBe('https://manual-donate.com')
  })

  it('falls back to manual catalog when fund.at returns null', async () => {
    mockFetchFundAt.mockResolvedValue(null)
    mockCatalog.mockReturnValueOnce(null) // during fund.at merge
    mockCatalog.mockReturnValueOnce(manualRecord({ contributeUrl: 'https://manual.com' })) // fallback

    const result = await resolveFunding(identity())
    expect(result.funding.source).toBe('manual')
    expect(result.funding.contributeUrl).toBe('https://manual.com')
  })

  it('returns unknown when both fund.at and manual miss', async () => {
    mockFetchFundAt.mockResolvedValue(null)
    mockCatalog.mockReturnValue(null)

    const result = await resolveFunding(identity())
    expect(result.funding.source).toBe('unknown')
    expect(result.funding.contributeUrl).toBeUndefined()
  })

  it('returns warning and falls back when fund.at fetch throws', async () => {
    mockFetchFundAt.mockRejectedValue(new Error('PDS unreachable'))
    mockCatalog.mockReturnValue(null)

    const result = await resolveFunding(identity())
    expect(result.warning).toBeDefined()
    expect(result.warning!.step).toBe('fund-at-fetch')
    expect(result.warning!.message).toBe('PDS unreachable')
    expect(result.funding.source).toBe('unknown')
  })

  it('skips fund.at fetch when DID is undefined', async () => {
    mockCatalog.mockReturnValue(null)

    const result = await resolveFunding(identity({ did: undefined }))
    expect(mockFetchFundAt).not.toHaveBeenCalled()
    expect(result.funding.source).toBe('unknown')
  })

  it('uses prefetch map when available in ScanContext', async () => {
    const prefetchMap = new Map<string, Promise<{ contributeUrl?: string; dependencies?: Array<{ uri: string }> } | null>>()
    prefetchMap.set('did:plc:abc123', Promise.resolve({
      contributeUrl: 'https://prefetched.com',
    }))
    mockCatalog.mockReturnValue(null)

    const ctx = {
      fundAtPrefetch: prefetchMap,
      prefetch: vi.fn(),
      prefetchUnbounded: vi.fn(),
    }

    const result = await resolveFunding(identity(), { ctx })
    expect(result.funding.source).toBe('fund.at')
    expect(result.funding.contributeUrl).toBe('https://prefetched.com')
    // Should NOT have called the direct fetch
    expect(mockFetchFundAt).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// resolveFundingForDep
// ---------------------------------------------------------------------------

describe('resolveFundingForDep', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns fund.at source when records found', async () => {
    mockFetchRecords.mockResolvedValue({
      contributeUrl: 'https://donate.dep.com',
    })
    mockCatalog.mockReturnValue(null)

    const result = await resolveFundingForDep(identity())
    expect(result.source).toBe('fund.at')
    expect(result.contributeUrl).toBe('https://donate.dep.com')
  })

  it('falls back to manual when fund.at returns null', async () => {
    mockFetchRecords.mockResolvedValue(null)
    mockCatalog.mockReturnValueOnce(null) // fund.at merge call
    mockCatalog.mockReturnValueOnce(manualRecord({ contributeUrl: 'https://manual.com' }))

    const result = await resolveFundingForDep(identity())
    expect(result.source).toBe('manual')
  })

  it('falls back to unknown when both miss', async () => {
    mockFetchRecords.mockResolvedValue(null)
    mockCatalog.mockReturnValue(null)

    const result = await resolveFundingForDep(identity())
    expect(result.source).toBe('unknown')
  })

  it('falls back gracefully when fund.at fetch throws', async () => {
    mockFetchRecords.mockRejectedValue(new Error('network error'))
    mockCatalog.mockReturnValue(null)

    const result = await resolveFundingForDep(identity())
    // Should not throw, should return unknown
    expect(result.source).toBe('unknown')
  })

  it('uses prefetch map when available', async () => {
    const prefetchMap = new Map()
    prefetchMap.set('did:plc:abc123', Promise.resolve({
      contributeUrl: 'https://prefetched.com',
    }))
    mockCatalog.mockReturnValue(null)

    const ctx = {
      fundAtPrefetch: prefetchMap,
      prefetch: vi.fn(),
      prefetchUnbounded: vi.fn(),
    }

    const result = await resolveFundingForDep(identity(), ctx)
    expect(result.source).toBe('fund.at')
    expect(result.contributeUrl).toBe('https://prefetched.com')
    expect(mockFetchRecords).not.toHaveBeenCalled()
  })

  it('skips fund.at when DID is undefined', async () => {
    mockCatalog.mockReturnValue(null)

    const result = await resolveFundingForDep(identity({ did: undefined }))
    expect(mockFetchRecords).not.toHaveBeenCalled()
    expect(result.source).toBe('unknown')
  })
})
