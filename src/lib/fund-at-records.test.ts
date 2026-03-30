import { describe, it, expect } from 'vitest'
import {
  collectRecordValues,
  readLinks,
  readDependencyUris,
  pickBestContribute,
  pickBestDisclosure,
  extractDisclosureMeta,
  isHostScopedDependency,
  allowlistedForDomain,
} from './fund-at-records'

describe('collectRecordValues', () => {
  it('extracts object values from records', () => {
    const records = [
      { value: { foo: 'bar' } },
      { value: { baz: 1 } },
    ]
    expect(collectRecordValues(records)).toEqual([{ foo: 'bar' }, { baz: 1 }])
  })

  it('skips non-object values', () => {
    const records = [
      { value: 'string' },
      { value: null },
      { value: [1, 2] },
      { value: { ok: true } },
    ]
    expect(collectRecordValues(records)).toEqual([{ ok: true }])
  })

  it('handles empty input', () => {
    expect(collectRecordValues([])).toEqual([])
  })
})

describe('readLinks', () => {
  it('extracts valid links', () => {
    const value = {
      links: [
        { label: 'Donate', url: 'https://example.com/donate' },
        { label: 'GitHub', url: 'https://github.com/example' },
      ],
    }
    expect(readLinks(value)).toEqual([
      { label: 'Donate', url: 'https://example.com/donate' },
      { label: 'GitHub', url: 'https://github.com/example' },
    ])
  })

  it('skips items missing label or url', () => {
    const value = {
      links: [
        { label: 'Good', url: 'https://example.com' },
        { label: 'No URL' },
        { url: 'https://no-label.com' },
        { label: 'Empty URL', url: '' },
        { label: 123, url: 'https://bad-label.com' },
      ],
    }
    expect(readLinks(value)).toEqual([
      { label: 'Good', url: 'https://example.com' },
    ])
  })

  it('returns empty array when links is not an array', () => {
    expect(readLinks({})).toEqual([])
    expect(readLinks({ links: 'not-array' })).toEqual([])
    expect(readLinks({ links: null })).toEqual([])
  })
})

describe('readDependencyUris', () => {
  it('normalizes valid dependency URIs', () => {
    const value = {
      uris: ['bsky.app', 'did:plc:abc123', 'Example.COM'],
    }
    expect(readDependencyUris(value)).toEqual([
      'bsky.app',
      'did:plc:abc123',
      'example.com',
    ])
  })

  it('skips empty and invalid entries', () => {
    const value = {
      uris: ['', '  ', 'good.example', 'has/slash', 'has:colon'],
    }
    expect(readDependencyUris(value)).toEqual(['good.example'])
  })

  it('skips non-string entries', () => {
    const value = { uris: [123, null, 'valid.com'] }
    expect(readDependencyUris(value)).toEqual(['valid.com'])
  })

  it('returns empty array when uris is missing or not array', () => {
    expect(readDependencyUris({})).toEqual([])
    expect(readDependencyUris({ uris: 'string' })).toEqual([])
  })
})

describe('pickBestContribute', () => {
  it('returns null for empty input', () => {
    expect(pickBestContribute([])).toBeNull()
  })

  it('picks the record with links and the most recent effectiveDate', () => {
    const values = [
      {
        effectiveDate: '2024-01-01',
        links: [{ label: 'Old', url: 'https://old.com' }],
      },
      {
        effectiveDate: '2025-06-15',
        links: [{ label: 'New', url: 'https://new.com' }],
      },
      {
        effectiveDate: '2025-01-01',
        links: [{ label: 'Mid', url: 'https://mid.com' }],
      },
    ]
    const best = pickBestContribute(values)
    expect(best).not.toBeNull()
    expect(readLinks(best!)).toEqual([{ label: 'New', url: 'https://new.com' }])
  })

  it('skips records with no links', () => {
    const values = [
      { effectiveDate: '2025-06-15' }, // no links
      { effectiveDate: '2024-01-01', links: [{ label: 'OK', url: 'https://ok.com' }] },
    ]
    const best = pickBestContribute(values)
    expect(best).not.toBeNull()
    expect(readLinks(best!)).toEqual([{ label: 'OK', url: 'https://ok.com' }])
  })

  it('returns null when no records have links', () => {
    const values = [
      { effectiveDate: '2025-06-15' },
      { effectiveDate: '2024-01-01' },
    ]
    expect(pickBestContribute(values)).toBeNull()
  })
})

describe('pickBestDisclosure', () => {
  it('returns null for empty input', () => {
    expect(pickBestDisclosure([])).toBeNull()
  })

  it('picks disclosure with most recent effectiveDate', () => {
    const values = [
      { meta: { displayName: 'Old' }, effectiveDate: '2024-01-01' },
      { meta: { displayName: 'New' }, effectiveDate: '2025-06-15' },
    ]
    const best = pickBestDisclosure(values)
    expect(best).not.toBeNull()
    expect((best!.meta as { displayName: string }).displayName).toBe('New')
  })

  it('skips records without disclosure meta', () => {
    const values = [
      { noMeta: true },
      { meta: { displayName: 'Valid' } },
    ]
    const best = pickBestDisclosure(values)
    expect(best).not.toBeNull()
    expect((best!.meta as { displayName: string }).displayName).toBe('Valid')
  })

  it('returns null when no records have meta', () => {
    const values = [{ noMeta: true }, { meta: {} }]
    expect(pickBestDisclosure(values)).toBeNull()
  })
})

describe('extractDisclosureMeta', () => {
  it('extracts full disclosure metadata', () => {
    const value = {
      meta: {
        displayName: 'Test App',
        description: 'A test application',
        landingPage: 'https://test.app',
      },
      contact: {
        general: {
          handle: '@testuser.bsky.social',
          url: 'https://test.app/contact',
          email: 'hello@test.app',
        },
        press: {
          url: 'https://test.app/press',
          email: 'press@test.app',
        },
      },
      security: {
        policyUri: 'https://test.app/security',
        contactUri: 'https://test.app/security-contact',
      },
      legal: {
        privacyPolicyUri: 'https://test.app/privacy',
        termsOfServiceUri: 'https://test.app/tos',
        donorTermsUri: 'https://test.app/donor-terms',
        taxDisclosureUri: 'https://test.app/tax',
        softwareLicenseUri: 'https://test.app/license',
      },
    }
    const meta = extractDisclosureMeta(value)
    expect(meta).not.toBeNull()
    expect(meta!.displayName).toBe('Test App')
    expect(meta!.description).toBe('A test application')
    expect(meta!.landingPage).toBe('https://test.app')
    expect(meta!.contactGeneralHandle).toBe('testuser.bsky.social') // @ stripped
    expect(meta!.contactGeneralUrl).toBe('https://test.app/contact')
    expect(meta!.contactGeneralEmail).toBe('hello@test.app')
    expect(meta!.contactPressUrl).toBe('https://test.app/press')
    expect(meta!.contactPressEmail).toBe('press@test.app')
    expect(meta!.securityPolicyUri).toBe('https://test.app/security')
    expect(meta!.securityContactUri).toBe('https://test.app/security-contact')
    expect(meta!.privacyPolicyUri).toBe('https://test.app/privacy')
    expect(meta!.termsOfServiceUri).toBe('https://test.app/tos')
    expect(meta!.donorTermsUri).toBe('https://test.app/donor-terms')
    expect(meta!.taxDisclosureUri).toBe('https://test.app/tax')
    expect(meta!.softwareLicenseUri).toBe('https://test.app/license')
  })

  it('returns null when meta is missing or empty', () => {
    expect(extractDisclosureMeta({})).toBeNull()
    expect(extractDisclosureMeta({ meta: {} })).toBeNull()
    expect(extractDisclosureMeta({ meta: 'string' })).toBeNull()
  })

  it('strips @ from contact handle', () => {
    const value = {
      meta: { displayName: 'X' },
      contact: { general: { handle: '@user.bsky.social' } },
    }
    expect(extractDisclosureMeta(value)!.contactGeneralHandle).toBe('user.bsky.social')
  })

  it('omits handle when empty after trimming', () => {
    const value = {
      meta: { displayName: 'X' },
      contact: { general: { handle: '  @  ' } },
    }
    expect(extractDisclosureMeta(value)!.contactGeneralHandle).toBeUndefined()
  })

  it('handles partial metadata gracefully', () => {
    const value = { meta: { displayName: 'Minimal' } }
    const meta = extractDisclosureMeta(value)
    expect(meta).not.toBeNull()
    expect(meta!.displayName).toBe('Minimal')
    expect(meta!.description).toBeUndefined()
    expect(meta!.contactGeneralHandle).toBeUndefined()
  })
})

describe('isHostScopedDependency', () => {
  it('returns true when no appliesToNsidPrefix', () => {
    expect(isHostScopedDependency({})).toBe(true)
  })

  it('returns true when appliesToNsidPrefix is empty', () => {
    expect(isHostScopedDependency({ appliesToNsidPrefix: '' })).toBe(true)
    expect(isHostScopedDependency({ appliesToNsidPrefix: '  ' })).toBe(true)
  })

  it('returns false when appliesToNsidPrefix is set', () => {
    expect(isHostScopedDependency({ appliesToNsidPrefix: 'app.bsky.' })).toBe(false)
  })
})

describe('allowlistedForDomain', () => {
  it('allows all domains when restrictToDomains is null/undefined', () => {
    expect(allowlistedForDomain({}, 'anything.com')).toBe(true)
  })

  it('allows all domains when restrictToDomains is empty array', () => {
    expect(allowlistedForDomain({ restrictToDomains: [] }, 'anything.com')).toBe(true)
  })

  it('returns false when restrictToDomains is not an array', () => {
    expect(allowlistedForDomain({ restrictToDomains: 'string' }, 'anything.com')).toBe(false)
  })

  it('matches exact domain (case-insensitive)', () => {
    const value = { restrictToDomains: ['example.com', 'other.com'] }
    expect(allowlistedForDomain(value, 'example.com')).toBe(true)
    expect(allowlistedForDomain(value, 'Example.COM')).toBe(true)
    expect(allowlistedForDomain(value, 'notlisted.com')).toBe(false)
  })

  it('returns false for invalid domain needle', () => {
    const value = { restrictToDomains: ['example.com'] }
    expect(allowlistedForDomain(value, '')).toBe(false)
    expect(allowlistedForDomain(value, 'has/slash')).toBe(false)
  })
})
