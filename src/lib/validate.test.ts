import { describe, it, expect } from 'vitest'
import { validateUrl, validateEmail, validateHandle, validateIfPresent } from './validate'

describe('validateUrl', () => {
  it('accepts valid https URLs', () => {
    expect(validateUrl('https://example.com')).toBeNull()
    expect(validateUrl('https://example.com/path?q=1')).toBeNull()
    expect(validateUrl('https://sub.example.co.uk')).toBeNull()
  })

  it('accepts valid http URLs', () => {
    expect(validateUrl('http://localhost:3000')).toBeNull()
    expect(validateUrl('http://example.com')).toBeNull()
  })

  it('rejects non-http protocols', () => {
    expect(validateUrl('ftp://example.com')).toBe('Must start with https://')
    expect(validateUrl('javascript:alert(1)')).toBe('Must start with https://')
    expect(validateUrl('data:text/html,<h1>hi</h1>')).toBe('Must start with https://')
    expect(validateUrl('file:///etc/passwd')).toBe('Must start with https://')
  })

  it('rejects invalid URLs', () => {
    expect(validateUrl('not-a-url')).toBe('Not a valid URL')
    expect(validateUrl('')).toBe('Not a valid URL')
    expect(validateUrl('example.com')).toBe('Not a valid URL')
  })
})

describe('validateEmail', () => {
  it('accepts valid email addresses', () => {
    expect(validateEmail('user@example.com')).toBeNull()
    expect(validateEmail('name+tag@sub.example.co.uk')).toBeNull()
    expect(validateEmail('a@b.c')).toBeNull()
  })

  it('rejects emails without @', () => {
    expect(validateEmail('userexample.com')).toBe('Not a valid email address')
  })

  it('rejects emails without domain dot', () => {
    expect(validateEmail('user@localhost')).toBe('Not a valid email address')
  })

  it('rejects emails with spaces', () => {
    expect(validateEmail('user @example.com')).toBe('Not a valid email address')
    expect(validateEmail('user@ example.com')).toBe('Not a valid email address')
  })

  it('rejects empty string', () => {
    expect(validateEmail('')).toBe('Not a valid email address')
  })
})

describe('validateHandle', () => {
  it('accepts valid handles', () => {
    expect(validateHandle('you.bsky.social')).toBeNull()
    expect(validateHandle('@you.bsky.social')).toBeNull()
    expect(validateHandle('custom.domain.com')).toBeNull()
  })

  it('rejects handles without dots', () => {
    expect(validateHandle('nodots')).toBe('Should look like you.bsky.social')
    expect(validateHandle('@nodots')).toBe('Should look like you.bsky.social')
  })

  it('rejects handles with spaces', () => {
    expect(validateHandle('has spaces.com')).toBe("Handles don't have spaces")
    expect(validateHandle('has .spaces.com')).toBe("Handles don't have spaces")
  })

  it('strips leading @ before validation', () => {
    // @handle.bsky.social → handle.bsky.social (has dot, no space) → valid
    expect(validateHandle('@handle.bsky.social')).toBeNull()
    // @nodots → nodots (no dot) → invalid
    expect(validateHandle('@nodots')).toBe('Should look like you.bsky.social')
  })
})

describe('validateIfPresent', () => {
  it('returns null for empty or blank values', () => {
    const alwaysFails = () => 'error'
    expect(validateIfPresent('', alwaysFails)).toBeNull()
    expect(validateIfPresent('   ', alwaysFails)).toBeNull()
    expect(validateIfPresent('\t\n', alwaysFails)).toBeNull()
  })

  it('runs validator for non-empty values', () => {
    expect(validateIfPresent('https://example.com', validateUrl)).toBeNull()
    expect(validateIfPresent('not-a-url', validateUrl)).toBe('Not a valid URL')
  })

  it('trims whitespace before validating', () => {
    expect(validateIfPresent('  https://example.com  ', validateUrl)).toBeNull()
  })
})
