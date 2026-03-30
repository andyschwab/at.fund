import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { getSessionHandle } from '@/lib/auth/session-handle'
import { isAdminHandle } from '@/lib/admins'
import {
  fingerprintPdsHost,
  summarizePlatforms,
  type PdsPlatformFingerprint,
} from '@/lib/pds-platform'

function parseHosts(raw: string): string[] {
  if (!raw.trim()) return []
  return raw
    .split(/\r?\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const handle = await getSessionHandle(session)
  if (!handle || !isAdminHandle(handle)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    body = null
  }

  const hosts = parseHosts(
    typeof (body as { hosts?: unknown } | null)?.hosts === 'string'
      ? ((body as { hosts?: unknown }).hosts as string)
      : '',
  )
  if (hosts.length === 0) {
    return NextResponse.json(
      { error: 'No hosts provided. Send JSON: { "hosts": "pds1\\npds2" }' },
      { status: 400 },
    )
  }

  const fingerprints = (
    await Promise.all(hosts.map((h) => fingerprintPdsHost(h)))
  ).filter(Boolean) as PdsPlatformFingerprint[]

  return NextResponse.json({
    total: fingerprints.length,
    summary: summarizePlatforms(fingerprints),
    fingerprints,
  })
}

