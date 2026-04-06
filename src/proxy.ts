import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Centralized auth guard. Runs before every matched route.
 *
 * Checks for the `did` cookie (set during OAuth callback). This is a
 * lightweight gate — full session validation still happens in route handlers
 * via getSession(). The proxy just prevents unauthenticated requests from
 * reaching protected pages and API routes.
 */

/** Page routes that require a session. */
const PROTECTED_PAGES = ['/give', '/admin']

/** API route prefixes that require a session. */
const PROTECTED_API = [
  '/api/setup',
  '/api/endorse',
  '/api/migrate',
  '/api/lexicons',
  '/api/admin',
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasDid = request.cookies.has('did')

  // Protected page — redirect to home
  if (!hasDid && PROTECTED_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Protected API — 401
  if (!hasDid && PROTECTED_API.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Run on protected pages and API routes only.
     * Excludes: public pages, OAuth routes, static files, health/entry/steward APIs.
     */
    '/give/:path*',
    '/admin/:path*',
    '/api/setup/:path*',
    '/api/endorse/:path*',
    '/api/migrate/:path*',
    '/api/lexicons/:path*',
    '/api/admin/:path*',
  ],
}
