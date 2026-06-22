// ---------------------------------------------------------------------------
// HeartHandshake SVG paths (Lucide, 24×24 viewBox)
// ---------------------------------------------------------------------------

export const HEART_HANDSHAKE_PATHS = [
  'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  'M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08v0c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66',
  'm18 15-2-2',
  'm15 18-2-2',
] as const

// Paths from src/app/icon.svg (100×100 viewBox, white stroke on emerald circle)
export const CIRCLE_BADGE_PATHS = [
  'M68 55c4-3.8 8-8.5 8-14.5A14 14 0 0 0 62 27c-4.4 0-7.5 1.2-12 5-4.5-3.8-7.6-5-12-5A14 14 0 0 0 24 40.5c0 6 4 10.7 8 14.5l18 18Z',
  'M50 34l-7.2 7.2a5.5 5.5 0 0 0 0 7.8c2.1 2.1 5.4 2.2 7.6.2l5-4.6a7 7 0 0 1 9.6 0l7 6.4',
  'M66 57.5l-5-5',
  'M59.5 64l-5-5',
] as const

export const SUPPORT_COLOR = '#059669'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BadgeStyle = 'inline' | 'circle'
export type BadgeSize = 16 | 18 | 20 | 24

export type ProfileLinkBadgeOptions = {
  style?: BadgeStyle
  size?: BadgeSize
  baseUrl?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function pathsToSvg(paths: readonly string[]): string {
  return paths.map((d) => `<path d="${d}"/>`).join('')
}

function inlineSvg(size: BadgeSize): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"`,
    ` fill="none" stroke="${SUPPORT_COLOR}" stroke-width="1.75"`,
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    pathsToSvg(HEART_HANDSHAKE_PATHS),
    '</svg>',
  ].join('')
}

function circleSvg(size: BadgeSize): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">`,
    `<circle cx="50" cy="50" r="50" fill="${SUPPORT_COLOR}"/>`,
    `<g fill="none" stroke="white" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">`,
    pathsToSvg(CIRCLE_BADGE_PATHS),
    '</g></svg>',
  ].join('')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a self-contained HTML snippet: heart-hands icon linking to an at.fund profile.
 * Intended for credits/attribution pages alongside primary project links.
 */
export function buildProfileLinkHtml(
  handle: string,
  opts: ProfileLinkBadgeOptions = {},
): string {
  const trimmed = handle.trim()
  if (!trimmed) return ''

  const style = opts.style ?? 'inline'
  const size = opts.size ?? 18
  const baseUrl = (opts.baseUrl ?? 'https://at.fund').replace(/\/$/, '')
  const profileUrl = `${baseUrl}/${encodeURIComponent(trimmed)}`
  const label = `View ${trimmed} on at.fund`

  const svg = style === 'circle' ? circleSvg(size) : inlineSvg(size)

  return [
    `<a href="${esc(profileUrl)}"`,
    ` target="_blank" rel="noopener noreferrer"`,
    ` aria-label="${esc(label)}"`,
    ` style="display:inline-flex;align-items:center;vertical-align:text-bottom;margin-left:0.25em;text-decoration:none;line-height:1">`,
    svg,
    '</a>',
  ].join('')
}
