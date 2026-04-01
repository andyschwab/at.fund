import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client, l } from '@atproto/lex'
import * as fund from '@/lexicons/fund'
import { validateUrl } from '@/lib/validate'
import { logger } from '@/lib/logger'

export type SetupPayload = {
  contributeUrl?: string
  dependencies?: Array<{ uri: string; label?: string }>
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}

function parsePayload(body: unknown): SetupPayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>

  const contributeUrl = str(b.contributeUrl)

  const dependencies: Array<{ uri: string; label?: string }> = []
  if (Array.isArray(b.dependencies)) {
    for (const item of b.dependencies) {
      if (!item || typeof item !== 'object') continue
      const uri = str((item as Record<string, unknown>).uri)
      const label = str((item as Record<string, unknown>).label)
      if (uri) dependencies.push({ uri, ...(label && { label }) })
    }
  }

  if (!contributeUrl && dependencies.length === 0) return null

  return { contributeUrl, dependencies: dependencies.length > 0 ? dependencies : undefined }
}

function validatePayload(p: SetupPayload): Record<string, string> | null {
  const issues: Record<string, string> = {}

  if (p.contributeUrl) {
    const err = validateUrl(p.contributeUrl)
    if (err) issues.contributeUrl = err
  }

  return Object.keys(issues).length > 0 ? issues : null
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const payload = parsePayload(body)
  if (!payload) {
    return NextResponse.json(
      { error: 'At least a contributeUrl or dependencies are required' },
      { status: 400 },
    )
  }

  const fieldErrors = validatePayload(payload)
  if (fieldErrors) {
    return NextResponse.json(
      {
        error: 'Some fields have invalid values',
        detail: 'Fix the highlighted fields and try again.',
        fields: fieldErrors,
      },
      { status: 400 },
    )
  }

  const client = new Client(session)
  const createdAt = l.toDatetimeString(new Date())
  const uri = (v: string) => l.asStringFormat(v, 'uri')

  try {
    // Write fund.at.contribute (singleton with rkey "self")
    if (payload.contributeUrl) {
      await client.put(fund.at.contribute, {
        url: uri(payload.contributeUrl),
        createdAt,
      })
    }

    // Write fund.at.dependency records (one per dependency)
    if (payload.dependencies) {
      for (const dep of payload.dependencies) {
        await client.put(fund.at.dependency, {
          uri: dep.uri,
          ...(dep.label && { label: dep.label }),
          createdAt,
        }, { rkey: dep.uri })
      }
    }

    logger.info('setup: records published', { did: session.did })
    return NextResponse.json({ success: true })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to publish records'
    logger.error('setup: publish failed', {
      did: session.did,
      error: message,
      stack: e instanceof Error ? e.stack : undefined,
    })
    return NextResponse.json(
      {
        error: message,
        detail:
          'Could not publish your records. This may be a permissions issue — try signing out and back in to refresh your authorization.',
      },
      { status: 502 },
    )
  }
}
