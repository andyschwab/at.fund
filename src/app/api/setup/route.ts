import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client, l } from '@atproto/lex'
import * as fund from '@/lexicons/fund'
import { FUND_CONTRIBUTE, FUND_DEPENDENCY } from '@/lib/fund-at-records'
import { validateUrl } from '@/lib/validate'
import { logger } from '@/lib/logger'
import { str } from '@/lib/str'

export type SetupPayload = {
  contributeUrl?: string
  dependencies?: Array<{ uri: string; label?: string }>
  /** Previous state from the PDS — used to diff and delete removed records. */
  existing?: {
    contributeUrl?: string
    dependencies?: Array<{ uri: string }>
  }
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

  // Parse existing state for diffing
  let existing: SetupPayload['existing']
  if (b.existing && typeof b.existing === 'object' && !Array.isArray(b.existing)) {
    const ex = b.existing as Record<string, unknown>
    existing = {
      contributeUrl: str(ex.contributeUrl) || undefined,
      dependencies: Array.isArray(ex.dependencies)
        ? (ex.dependencies as Array<Record<string, unknown>>)
            .map((d) => ({ uri: str(d?.uri) || '' }))
            .filter((d) => d.uri)
        : undefined,
    }
  }

  return {
    contributeUrl,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    existing,
  }
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
      { error: 'Invalid request body' },
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
    // ── Contribute URL: create/update or delete ─────────────────────────
    if (payload.contributeUrl) {
      await client.put(fund.at.contribute, {
        url: uri(payload.contributeUrl),
        createdAt,
      })
    } else if (payload.existing?.contributeUrl) {
      // User cleared the contribute URL — delete the record
      try {
        await client.deleteRecord(FUND_CONTRIBUTE, 'self')
      } catch {
        // Record may already be gone
      }
    }

    // ── Dependencies: create/update new, delete removed ─────────────────
    if (payload.dependencies) {
      for (const dep of payload.dependencies) {
        await client.put(fund.at.dependency, {
          uri: dep.uri,
          ...(dep.label && { label: dep.label }),
          createdAt,
        }, { rkey: dep.uri })
      }
    }

    // Delete dependencies that were in existing but not in the new list
    const newDepUris = new Set(payload.dependencies?.map((d) => d.uri) ?? [])
    for (const prev of payload.existing?.dependencies ?? []) {
      if (!newDepUris.has(prev.uri)) {
        try {
          await client.deleteRecord(FUND_DEPENDENCY, prev.uri)
        } catch {
          // Record may already be gone
        }
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
