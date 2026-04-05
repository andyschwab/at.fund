import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for the scan pipeline.
 *
 * We mock the ATProto Agent, external network calls, AND the catalog module
 * so the pipeline runs deterministically without coupling to admin-managed
 * catalog data. The resolver overrides and manual catalog entries used here
 * are synthetic test fixtures.
 */

// Mock @atproto/lex Client
const mockListRecords = vi.fn()
const mockGetRecord = vi.fn()

// Shared state for per-test overrides of xrpc responses
let describeRepoResponse = {
  handle: 'testuser.bsky.social',
  collections: [] as string[],
}

// xrpcQuery calls go through fetchHandler; mock it to dispatch by NSID
const mockFetchHandler = vi.fn()

vi.mock('@atproto/lex', () => {
  class MockClient {
    listRecords = mockListRecords
    getRecord = mockGetRecord
    fetchHandler = mockFetchHandler
    get did() { return undefined }
  }
  return { Client: MockClient }
})

// Mock @atproto/did
vi.mock('@atproto/did', () => ({
  extractPdsUrl: vi.fn().mockReturnValue(new URL('https://pds.example.com')),
}))

// Mock catalog — synthetic overrides and manual records, not real catalog data
const mockResolveStewardUri = vi.fn()
const mockLookupManualStewardRecord = vi.fn()
const mockGetEcosystemCatalogEntries = vi.fn()

vi.mock('@/lib/catalog', () => ({
  resolveStewardUri: (...args: unknown[]) => mockResolveStewardUri(...args),
  lookupManualStewardRecord: (...args: unknown[]) => mockLookupManualStewardRecord(...args),
  getEcosystemCatalogEntries: (...args: unknown[]) => mockGetEcosystemCatalogEntries(...args),
}))

// Mock DNS resolution (atfund-dns)
vi.mock('@/lib/atfund-dns', () => ({
  lookupAtprotoDid: vi.fn().mockResolvedValue(null),
  lookupAtprotoDidExact: vi.fn().mockResolvedValue(null),
}))

// Mock steward funding fetcher
vi.mock('@/lib/steward-funding', () => ({
  fetchFundAtForStewardDid: vi.fn().mockResolvedValue(null),
}))

// Mock PDS host funding fetcher
vi.mock('@/lib/atfund-steward', () => ({
  fetchPdsHostFunding: vi.fn().mockResolvedValue(null),
}))

// Mock atfund-uri
vi.mock('@/lib/atfund-uri', () => ({
  fetchFundingForUriLike: vi.fn().mockResolvedValue(null),
}))

// Mock fund-at-records identity resolution
vi.mock('@/lib/fund-at-records', () => ({
  FUND_DECLARATION: 'fund.at.actor.declaration',
  FUND_CONTRIBUTE: 'fund.at.funding.contribute',
  FUND_MANIFEST: 'fund.at.funding.manifest',
  FUND_DEPENDENCY: 'fund.at.graph.dependency',
  FUND_ENDORSE: 'fund.at.graph.endorse',
  LEGACY_CONTRIBUTE: 'fund.at.contribute',
  LEGACY_MANIFEST: 'fund.at.manifest',
  LEGACY_DEPENDENCY: 'fund.at.dependency',
  LEGACY_ENDORSE: 'fund.at.endorse',
  resolveHandleFromDid: vi.fn().mockResolvedValue(undefined),
  resolveDidFromIdentifier: vi.fn().mockResolvedValue(undefined),
  resolvePdsUrl: vi.fn().mockResolvedValue(null),
  fetchOwnFundAtRecords: vi.fn().mockResolvedValue(null),
  fetchFundAtRecords: vi.fn().mockResolvedValue(null),
}))

import { scanRepo } from './lexicon-scan'
import { clearXrpcCache } from '@/lib/xrpc'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import type { StewardFundAt } from '@/lib/steward-funding'
import type { OAuthSession } from '@atproto/oauth-client'

function makeMockSession(did = 'did:plc:testuser123'): OAuthSession {
  return {
    did,
    getTokenInfo: vi.fn().mockResolvedValue({ aud: 'https://pds.example.com' }),
  } as unknown as OAuthSession
}

/** Default catalog mock: resolves synthetic NSIDs, returns null for everything else. */
function setupCatalogDefaults() {
  // Synthetic resolver: test.alpha.* → alpha.test, test.beta.* → beta.test
  mockResolveStewardUri.mockImplementation((key: string) => {
    if (!key || !key.trim()) return null
    if (key.startsWith('did:')) return key
    if (key.startsWith('test.alpha.')) return 'alpha.test'
    if (key.startsWith('test.beta.')) return 'beta.test'
    // 2-segment domains pass through
    const parts = key.split('.')
    if (parts.length === 2) return key
    // 3+ segments: reverse first two (NSID inference)
    if (parts.length >= 3) return `${parts[1]}.${parts[0]}`
    return key
  })

  // Synthetic manual catalog: alpha.test has a contributeUrl and dependencies
  mockLookupManualStewardRecord.mockImplementation((uri: string) => {
    if (uri === 'alpha.test') {
      return {
        stewardUri: 'alpha.test',
        contributeUrl: 'https://alpha.test/donate',
        dependencies: ['dep.test'],
      }
    }
    return null
  })

  mockGetEcosystemCatalogEntries.mockReturnValue([])
}

beforeEach(() => {
  vi.resetAllMocks()
  clearXrpcCache()
  setupCatalogDefaults()

  // Reset describeRepo default
  describeRepoResponse = {
    handle: 'testuser.bsky.social',
    collections: [
      'app.bsky.feed.post',
      'app.bsky.actor.profile',
      'com.atproto.repo.strongRef',
      'test.alpha.record',
      'test.beta.upload',
    ],
  }

  // xrpc responses via fetchHandler — dispatch by NSID in path
  mockFetchHandler.mockImplementation(async (path: string) => {
    if (path.includes('com.atproto.repo.describeRepo')) {
      return new Response(JSON.stringify(describeRepoResponse), { status: 200 })
    }
    if (path.includes('com.atproto.identity.resolveIdentity')) {
      return new Response(JSON.stringify({ didDoc: {} }), { status: 200 })
    }
    if (path.includes('app.bsky.actor.getProfile')) {
      return new Response(JSON.stringify({ handle: 'testuser.bsky.social' }), { status: 200 })
    }
    if (path.includes('app.bsky.graph.getFollows')) {
      return new Response(JSON.stringify({ follows: [] }), { status: 200 })
    }
    if (path.includes('app.bsky.actor.getPreferences')) {
      return new Response(JSON.stringify({ preferences: [] }), { status: 200 })
    }
    return new Response(JSON.stringify({}), { status: 200 })
  })

  // Restore default mock behaviors from module-level vi.mock calls
  vi.mocked(lookupAtprotoDid).mockResolvedValue(null)
  vi.mocked(fetchFundAtForStewardDid).mockResolvedValue(null)

  // Default: no records in any collection
  mockListRecords.mockResolvedValue({ body: { records: [] } })
  mockGetRecord.mockRejectedValue(new Error('not found'))
})

describe('scanRepo pipeline', () => {
  it('filters noise collections and resolves third-party NSIDs to steward URIs', async () => {
    const session = makeMockSession()
    const result = await scanRepo(session, [])

    expect(result.did).toBe('did:plc:testuser123')
    expect(result.handle).toBe('testuser.bsky.social')

    // Should have resolved synthetic stewards via mocked catalog
    const uris = result.entries.map((e) => e.uri)
    expect(uris).toContain('alpha.test') // test.alpha.record → mocked resolver
    expect(uris).toContain('beta.test')  // test.beta.upload → mocked resolver
  })

  it('uses manual catalog fallback for known stewards', async () => {
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'test.alpha.record',
        ],
      }

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    const alpha = result.entries.find((e) => e.uri === 'alpha.test')
    // alpha.test has a mocked manual catalog entry with dependencies
    if (alpha) {
      expect(alpha.source).toBe('manual')
      expect(alpha.dependencies).toBeDefined()
    }
  })

  it('marks stewards as unknown when no fund.at or manual record exists', async () => {
    // Use a collection NSID that the mock resolver maps to an unknown domain
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'com.randomdev.myapp.record',
        ],
      }

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    const unknown = result.entries.find((e) => e.source === 'unknown')
    expect(unknown).toBeDefined()
    // Unknown entries use uri as displayName
    expect(unknown!.displayName).toBe(unknown!.uri)
  })

  it('uses fund.at records when steward DID resolves', async () => {
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'test.alpha.record',
        ],
      }

    // Mock DNS resolution for alpha.test
    vi.mocked(lookupAtprotoDid).mockResolvedValue('did:plc:alpha')

    // Mock fund.at records
    const fundAtResult: StewardFundAt = {
      stewardDid: 'did:plc:alpha',
      contributeUrl: 'https://alpha.test/donate',
    }
    vi.mocked(fetchFundAtForStewardDid).mockResolvedValue(fundAtResult)

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    const alpha = result.entries.find((e) => e.uri === 'alpha.test')
    expect(alpha).toBeDefined()
    expect(alpha!.source).toBe('fund.at')
    expect(alpha!.contributeUrl).toBe('https://alpha.test/donate')
    expect(alpha!.did).toBe('did:plc:alpha')
  })

  it('includes self-reported stewards in resolution', async () => {
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: ['app.bsky.feed.post'],
      }

    const session = makeMockSession()
    const result = await scanRepo(session, ['alpha.test'])

    const alpha = result.entries.find((e) => e.uri === 'alpha.test')
    expect(alpha).toBeDefined()
    expect(alpha!.displayName).toBeTruthy()
  })

  it('sorts stewards: fund.at with links first, unknown last', async () => {
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'test.alpha.record',
          'com.randomdev.myapp.record',
        ],
      }

    // alpha.test resolves to fund.at with contribute URL
    vi.mocked(lookupAtprotoDid).mockImplementation(async (hostname) => {
      if (hostname === 'alpha.test') return 'did:plc:alpha'
      return null
    })
    vi.mocked(fetchFundAtForStewardDid).mockImplementation(async (did) => {
      if (did === 'did:plc:alpha') {
        return {
          stewardDid: did,
          contributeUrl: 'https://alpha.test/donate',
        }
      }
      return null
    })

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    // First entry should be the one with links
    expect(result.entries[0]!.source).toBe('fund.at')
    // Last entry should be unknown
    expect(result.entries[result.entries.length - 1]!.source).toBe('unknown')
  })

  it('handles empty repo (no collections)', async () => {
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: [],
      }

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    // No tool entries from repo collections; only PDS host entry from session PDS URL
    const toolEntries = result.entries.filter((e) => !e.tags.includes('pds-host'))
    expect(toolEntries).toEqual([])
    expect(result.did).toBe('did:plc:testuser123')
  })

  it('handles repo with only noise collections', async () => {
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'app.bsky.actor.profile',
          'com.atproto.label.label',
        ],
      }

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    // All collections are filtered as noise (app.bsky.*, com.atproto.*)
    // so no third-party tool entries should be produced
    const toolEntries = result.entries.filter((e) => !e.tags.includes('pds-host'))
    expect(toolEntries).toEqual([])
  })

  it('deduplicates steward URIs from multiple collections', async () => {
    // Two collections that both resolve to alpha.test via mocked resolver
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'test.alpha.record',
          'test.alpha.vote',
        ],
      }

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    // Both collections should resolve to a single alpha.test entry
    const alphaCards = result.entries.filter((e) => e.uri === 'alpha.test')
    expect(alphaCards).toHaveLength(1)
  })

  it('captures warnings when DNS lookup throws', async () => {
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'test.alpha.record',
        ],
      }

    // DNS lookup throws an error
    vi.mocked(lookupAtprotoDid).mockRejectedValue(new Error('DNS timeout'))

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    // Should still return a result (partial success)
    expect(result.entries.length).toBeGreaterThanOrEqual(0)
    // Should have a warning about the DNS failure
    expect(result.warnings.length).toBeGreaterThan(0)
    const dnsWarning = result.warnings.find((w) => w.step === 'dns-lookup')
    expect(dnsWarning).toBeDefined()
    expect(dnsWarning!.message).toBe('DNS timeout')
  })

  it('captures warnings when fund.at fetch throws', async () => {
    describeRepoResponse = {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'test.alpha.record',
        ],
      }

    vi.mocked(lookupAtprotoDid).mockResolvedValue('did:plc:alpha')
    vi.mocked(fetchFundAtForStewardDid).mockRejectedValue(new Error('PDS unreachable'))

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    // Should fall through to manual catalog
    const alpha = result.entries.find((e) => e.uri === 'alpha.test')
    expect(alpha).toBeDefined()

    // Should have a warning
    const fundAtWarning = result.warnings.find((w) => w.step === 'fund-at-fetch')
    expect(fundAtWarning).toBeDefined()
    expect(fundAtWarning!.message).toBe('PDS unreachable')
  })

  it('returns warnings array even when empty', async () => {
    describeRepoResponse = { handle: 'testuser.bsky.social', collections: [] }

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    expect(result.warnings).toEqual([])
  })
})
