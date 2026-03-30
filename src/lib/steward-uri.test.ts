import { describe, it, expect } from 'vitest'
import { normalizeStewardUri } from './steward-uri'

describe('normalizeStewardUri', () => {
  it('returns null for empty/whitespace input', () => {
    expect(normalizeStewardUri('')).toBeNull()
    expect(normalizeStewardUri('  ')).toBeNull()
    expect(normalizeStewardUri('\n')).toBeNull()
  })

  it('passes through DID identifiers unchanged', () => {
    expect(normalizeStewardUri('did:plc:abc123')).toBe('did:plc:abc123')
    expect(normalizeStewardUri('did:web:example.com')).toBe('did:web:example.com')
  })

  it('trims whitespace from DIDs', () => {
    expect(normalizeStewardUri('  did:plc:abc123  ')).toBe('did:plc:abc123')
  })

  it('extracts hostname from URLs', () => {
    expect(normalizeStewardUri('https://example.com')).toBe('example.com')
    expect(normalizeStewardUri('https://Example.COM/path')).toBe('example.com')
    expect(normalizeStewardUri('http://sub.example.com:8080/foo')).toBe('sub.example.com')
  })

  it('returns null for invalid URLs', () => {
    expect(normalizeStewardUri('https://')).toBeNull()
    expect(normalizeStewardUri('ftp://')).toBeNull()
  })

  it('lowercases and trims hostnames', () => {
    expect(normalizeStewardUri('Example.COM')).toBe('example.com')
    expect(normalizeStewardUri('  bsky.app  ')).toBe('bsky.app')
  })

  it('strips trailing dots from hostnames', () => {
    expect(normalizeStewardUri('example.com.')).toBe('example.com')
  })

  it('rejects hostnames with slashes, colons, or spaces', () => {
    expect(normalizeStewardUri('example.com/path')).toBeNull()
    expect(normalizeStewardUri('example.com:8080')).toBeNull()
    expect(normalizeStewardUri('example com')).toBeNull()
  })

  it('handles single-label hostnames', () => {
    expect(normalizeStewardUri('localhost')).toBe('localhost')
  })
})
