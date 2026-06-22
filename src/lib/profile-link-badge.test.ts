import { describe, it, expect } from 'vitest'
import { buildProfileLinkHtml } from './profile-link-badge'

describe('buildProfileLinkHtml', () => {
  it('returns empty string for blank handle', () => {
    expect(buildProfileLinkHtml('')).toBe('')
    expect(buildProfileLinkHtml('  ')).toBe('')
  })

  it('builds inline profile link with default options', () => {
    const html = buildProfileLinkHtml('microcosm.blue')
    expect(html).toContain('href="https://at.fund/microcosm.blue"')
    expect(html).toContain('aria-label="View microcosm.blue on at.fund"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('viewBox="0 0 24 24"')
    expect(html).toContain('width="18"')
    expect(html).toContain('stroke="#059669"')
    expect(html).not.toContain('<circle')
  })

  it('builds circle badge style', () => {
    const html = buildProfileLinkHtml('atprotocol.dev', { style: 'circle' })
    expect(html).toContain('viewBox="0 0 100 100"')
    expect(html).toContain('fill="#059669"')
    expect(html).toContain('stroke="white"')
  })

  it('respects custom size', () => {
    const html = buildProfileLinkHtml('handle', { size: 24 })
    expect(html).toContain('width="24"')
    expect(html).toContain('height="24"')
  })

  it('respects custom baseUrl for local preview', () => {
    const html = buildProfileLinkHtml('test', { baseUrl: 'http://localhost:3000' })
    expect(html).toContain('href="http://localhost:3000/test"')
  })

  it('strips trailing slash from baseUrl', () => {
    const html = buildProfileLinkHtml('test', { baseUrl: 'https://at.fund/' })
    expect(html).toContain('href="https://at.fund/test"')
  })

  it('escapes HTML in handle for attribute safety', () => {
    const html = buildProfileLinkHtml('"><script>')
    expect(html).not.toContain('"><script>')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
  })

  it('encodes handle in URL', () => {
    const html = buildProfileLinkHtml('user name')
    expect(html).toContain('href="https://at.fund/user%20name"')
  })
})
