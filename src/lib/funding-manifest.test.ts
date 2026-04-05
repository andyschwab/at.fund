import { describe, it, expect } from 'vitest'
import { parseFundingManifest, detectPlatform } from './funding-manifest'

describe('parseFundingManifest', () => {
  it('parses a valid v1 manifest', () => {
    const input = {
      version: 'v1.0.0',
      entity: {
        type: 'individual',
        role: 'maintainer',
        name: 'Test Dev',
        email: 'test@example.com',
        description: 'A test developer',
        webpageUrl: { url: 'https://example.com' },
      },
      projects: [{
        guid: 'my-project',
        name: 'My Project',
        description: 'A cool project',
        webpageUrl: { url: 'https://example.com/project' },
        repositoryUrl: { url: 'https://github.com/test/project' },
        licenses: ['spdx:MIT'],
        tags: ['tool'],
      }],
      funding: {
        channels: [
          {
            guid: 'gh-sponsors',
            type: 'payment-provider',
            address: 'https://github.com/sponsors/testdev',
            description: 'GitHub Sponsors',
          },
          {
            guid: 'ko-fi',
            type: 'payment-provider',
            address: 'https://ko-fi.com/testdev',
          },
        ],
        plans: [
          {
            guid: 'supporter',
            status: 'active',
            name: 'Supporter',
            description: 'Basic support tier',
            amount: 5,
            currency: 'USD',
            frequency: 'monthly',
            channels: ['gh-sponsors', 'ko-fi'],
          },
          {
            guid: 'sustainer',
            status: 'active',
            name: 'Sustainer',
            amount: 25,
            currency: 'USD',
            frequency: 'monthly',
            channels: ['gh-sponsors'],
          },
        ],
      },
    }

    const result = parseFundingManifest(input)
    expect(result).not.toBeNull()
    expect(result!.version).toBe('v1.0.0')
    expect(result!.entity.name).toBe('Test Dev')
    expect(result!.funding.channels).toHaveLength(2)
    expect(result!.funding.channels[0]!.guid).toBe('gh-sponsors')
    expect(result!.funding.plans).toHaveLength(2)
    expect(result!.funding.plans[0]!.amount).toBe(5)
    expect(result!.funding.plans[0]!.frequency).toBe('monthly')
  })

  it('returns null for non-v1 version', () => {
    expect(parseFundingManifest({ version: 'v2.0.0', funding: { channels: [{ guid: 'a', address: 'x' }] } })).toBeNull()
  })

  it('returns null for missing channels', () => {
    expect(parseFundingManifest({ version: 'v1.0.0', funding: { channels: [] } })).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(parseFundingManifest(null)).toBeNull()
    expect(parseFundingManifest('string')).toBeNull()
    expect(parseFundingManifest(42)).toBeNull()
  })

  it('skips invalid channels gracefully', () => {
    const input = {
      version: 'v1.0.0',
      funding: {
        channels: [
          { guid: 'valid', type: 'other', address: 'https://example.com' },
          { bad: 'channel' },
          null,
        ],
        plans: [],
      },
    }
    const result = parseFundingManifest(input)
    expect(result).not.toBeNull()
    expect(result!.funding.channels).toHaveLength(1)
  })

  it('defaults unknown channel types to other', () => {
    const input = {
      version: 'v1.0.0',
      funding: {
        channels: [{ guid: 'x', type: 'crypto-wallet', address: 'abc123' }],
        plans: [],
      },
    }
    const result = parseFundingManifest(input)
    expect(result!.funding.channels[0]!.type).toBe('other')
  })

  it('defaults unknown frequency to other', () => {
    const input = {
      version: 'v1.0.0',
      funding: {
        channels: [{ guid: 'ch', type: 'other', address: 'https://example.com' }],
        plans: [{ guid: 'p', status: 'active', name: 'Plan', amount: 10, currency: 'USD', frequency: 'biweekly', channels: ['ch'] }],
      },
    }
    const result = parseFundingManifest(input)
    expect(result!.funding.plans[0]!.frequency).toBe('other')
  })
})

describe('detectPlatform', () => {
  it('detects GitHub Sponsors', () => {
    expect(detectPlatform('https://github.com/sponsors/testdev')).toBe('github-sponsors')
  })

  it('detects Open Collective', () => {
    expect(detectPlatform('https://opencollective.com/my-project')).toBe('open-collective')
  })

  it('detects Ko-fi', () => {
    expect(detectPlatform('https://ko-fi.com/testdev')).toBe('ko-fi')
  })

  it('detects Patreon', () => {
    expect(detectPlatform('https://patreon.com/testdev')).toBe('patreon')
  })

  it('detects Liberapay', () => {
    expect(detectPlatform('https://liberapay.com/testdev')).toBe('liberapay')
  })

  it('detects Buy Me a Coffee', () => {
    expect(detectPlatform('https://buymeacoffee.com/testdev')).toBe('buy-me-a-coffee')
  })

  it('detects PayPal', () => {
    expect(detectPlatform('https://paypal.me/testdev')).toBe('paypal')
  })

  it('returns null for unknown addresses', () => {
    expect(detectPlatform('https://example.com/donate')).toBeNull()
    expect(detectPlatform('bank-account-123')).toBeNull()
  })
})
