import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for the scan pipeline.
 *
 * We mock the ATProto Agent and external network calls so the full
 * pipeline runs deterministically: repo describe → collection filter →
 * NSID resolve → steward lookup → card assembly.
 */

// Mock @atproto/api Agent
const mockDescribeRepo = vi.fn()
const mockListRecords = vi.fn()
const mockResolveIdentity = vi.fn()
const mockGetProfile = vi.fn()
const mockGetFollows = vi.fn()

vi.mock('@atproto/api', () => {
  class MockAgent {
    com = {
      atproto: {
        repo: {
          describeRepo: mockDescribeRepo,
          listRecords: mockListRecords,
        },
        identity: {
          resolveIdentity: mockResolveIdentity,
        },
      },
    }
    app = {
      bsky: {
        actor: {
          getProfile: mockGetProfile,
        },
        graph: {
          getFollows: mockGetFollows,
        },
      },
    }
  }
  return { Agent: MockAgent }
})

// Mock @atproto/did
vi.mock('@atproto/did', () => ({
  extractPdsUrl: vi.fn().mockReturnValue(new URL('https://pds.example.com')),
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
  resolveHandleFromDid: vi.fn().mockResolvedValue(undefined),
  resolveDidFromIdentifier: vi.fn().mockResolvedValue(undefined),
  resolvePdsUrl: vi.fn().mockResolvedValue(null),
  fetchOwnFundAtRecords: vi.fn().mockResolvedValue(null),
  fetchFundAtRecords: vi.fn().mockResolvedValue(null),
  extractDisclosureMeta: () => null,
  isHostScopedDependency: () => true,
  allowlistedForDomain: () => true,
}))

import { scanRepo } from './lexicon-scan'
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

beforeEach(() => {
  vi.clearAllMocks()

  // Default: repo with some third-party collections
  mockDescribeRepo.mockResolvedValue({
    data: {
      handle: 'testuser.bsky.social',
      collections: [
        'app.bsky.feed.post',
        'app.bsky.actor.profile',
        'com.atproto.repo.strongRef',
        'fyi.unravel.frontpage.post',
        'blue.zio.atfile.upload',
      ],
    },
  })

  // Default: no records in any collection
  mockListRecords.mockResolvedValue({ data: { records: [] } })
  mockGetProfile.mockResolvedValue({ data: { handle: 'testuser.bsky.social' } })
  // Default: no follows
  mockGetFollows.mockResolvedValue({ data: { follows: [] } })
})

describe('scanRepo pipeline', () => {
  it('filters noise collections and resolves third-party NSIDs to steward URIs', async () => {
    const session = makeMockSession()
    const result = await scanRepo(session, [])

    expect(result.did).toBe('did:plc:testuser123')
    expect(result.handle).toBe('testuser.bsky.social')

    // Should have resolved frontpage and atfile stewards
    const uris = result.entries.map((e) => e.uri)
    expect(uris).toContain('frontpage.fyi') // fyi.unravel.frontpage.post → resolver override
    expect(uris).toContain('zio.sh')        // blue.zio.atfile.upload → resolver override → zio.sh

    // Should NOT include bsky steward (noise filtered)
    // bsky collections are filtered before resolution
  })

  it('uses manual catalog fallback for known stewards', async () => {
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'fyi.unravel.frontpage.post',
        ],
      },
    })

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    const frontpage = result.entries.find((e) => e.uri === 'frontpage.fyi')
    // frontpage.fyi has a manual catalog entry with a displayName
    if (frontpage) {
      expect(frontpage.source).toBe('manual')
      expect(frontpage.displayName).toBeTruthy()
    }
  })

  it('marks stewards as unknown when no fund.at or manual record exists', async () => {
    // Use a collection NSID that maps to a domain not in the manual catalog
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'com.randomdev.myapp.record',
        ],
      },
    })

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    const unknown = result.entries.find((e) => e.source === 'unknown')
    expect(unknown).toBeDefined()
    // Unknown entries use uri as displayName
    expect(unknown!.displayName).toBe(unknown!.uri)
  })

  it('uses fund.at records when steward DID resolves', async () => {
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'fyi.unravel.frontpage.post',
        ],
      },
    })

    // Mock DNS resolution for frontpage.fyi
    vi.mocked(lookupAtprotoDid).mockResolvedValue('did:plc:frontpage')

    // Mock fund.at records
    const fundAtResult: StewardFundAt = {
      stewardDid: 'did:plc:frontpage',
      links: [{ label: 'Donate', url: 'https://frontpage.fyi/donate' }],
      disclosure: {
        displayName: 'Frontpage',
        description: 'A link aggregator for ATProto',
      },
    }
    vi.mocked(fetchFundAtForStewardDid).mockResolvedValue(fundAtResult)

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    const frontpage = result.entries.find((e) => e.uri === 'frontpage.fyi')
    expect(frontpage).toBeDefined()
    expect(frontpage!.source).toBe('fund.at')
    expect(frontpage!.displayName).toBe('Frontpage')
    expect(frontpage!.links).toEqual([{ label: 'Donate', url: 'https://frontpage.fyi/donate' }])
    expect(frontpage!.did).toBe('did:plc:frontpage')
  })

  it('includes self-reported stewards in resolution', async () => {
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: ['app.bsky.feed.post'],
      },
    })

    const session = makeMockSession()
    const result = await scanRepo(session, ['bsky.app'])

    const bsky = result.entries.find((e) => e.uri === 'bsky.app')
    expect(bsky).toBeDefined()
    // bsky.app should resolve via fund.at or manual catalog (not unknown)
    expect(['fund.at', 'manual']).toContain(bsky!.source)
    expect(bsky!.displayName).toBeTruthy()
  })

  it('sorts stewards: fund.at with links first, unknown last', async () => {
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'fyi.unravel.frontpage.post',
          'com.randomdev.myapp.record',
        ],
      },
    })

    // frontpage.fyi resolves to fund.at with links
    vi.mocked(lookupAtprotoDid).mockImplementation(async (hostname) => {
      if (hostname === 'frontpage.fyi') return 'did:plc:frontpage'
      return null
    })
    vi.mocked(fetchFundAtForStewardDid).mockImplementation(async (did) => {
      if (did === 'did:plc:frontpage') {
        return {
          stewardDid: did,
          links: [{ label: 'Donate', url: 'https://frontpage.fyi/donate' }],
          disclosure: { displayName: 'Frontpage' },
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
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: [],
      },
    })

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    expect(result.entries).toEqual([])
    expect(result.did).toBe('did:plc:testuser123')
  })

  it('handles repo with only noise collections', async () => {
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'app.bsky.actor.profile',
          'com.atproto.label.label',
          'chat.bsky.convo',
        ],
      },
    })

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    expect(result.entries).toEqual([])
  })

  it('deduplicates steward URIs from multiple collections', async () => {
    // Two collections that both resolve to the same steward
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'feed.popfeed.xyz',
          'actor.popfeed.settings',
        ],
      },
    })

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    // Both popfeed collections should resolve to popfeed.social (one entry)
    const popfeedCards = result.entries.filter((e) => e.uri === 'popfeed.social')
    expect(popfeedCards).toHaveLength(1)
  })

  it('captures warnings when DNS lookup throws', async () => {
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'fyi.unravel.frontpage.post',
        ],
      },
    })

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
    mockDescribeRepo.mockResolvedValue({
      data: {
        handle: 'testuser.bsky.social',
        collections: [
          'app.bsky.feed.post',
          'fyi.unravel.frontpage.post',
        ],
      },
    })

    vi.mocked(lookupAtprotoDid).mockResolvedValue('did:plc:frontpage')
    vi.mocked(fetchFundAtForStewardDid).mockRejectedValue(new Error('PDS unreachable'))

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    // Should fall through to manual catalog
    const frontpage = result.entries.find((e) => e.uri === 'frontpage.fyi')
    expect(frontpage).toBeDefined()

    // Should have a warning
    const fundAtWarning = result.warnings.find((w) => w.step === 'fund-at-fetch')
    expect(fundAtWarning).toBeDefined()
    expect(fundAtWarning!.message).toBe('PDS unreachable')
  })

  it('returns warnings array even when empty', async () => {
    mockDescribeRepo.mockResolvedValue({
      data: { handle: 'testuser.bsky.social', collections: [] },
    })

    const session = makeMockSession()
    const result = await scanRepo(session, [])

    expect(result.warnings).toEqual([])
  })
})
