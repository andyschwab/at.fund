import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client, l } from '@atproto/lex'
import * as fund from '@/lexicons/fund'
import { FUND_CONTRIBUTE, FUND_CHANNEL, FUND_PLAN, FUND_DEPENDENCY, deleteWithFallback } from '@/lib/fund-at-records'
import { validateUrl } from '@/lib/validate'
import { logger } from '@/lib/logger'
import { str } from '@/lib/str'

export type ChannelInput = {
  id: string
  type?: string
  uri?: string
  description?: string
}

export type PlanInput = {
  id: string
  name: string
  description?: string
  amount: number        // whole currency units (e.g. 5 for $5)
  currency: string
  frequency: string
  channels?: string[]   // AT URIs of channel records
}

export type SetupPayload = {
  contributeUrl?: string
  dependencies?: Array<{ uri: string; label?: string }>
  channels?: ChannelInput[]
  plans?: PlanInput[]
  /** Previous state from the PDS — used to diff and delete removed records. */
  existing?: {
    contributeUrl?: string
    dependencies?: Array<{ uri: string }>
    channelIds?: string[]
    planIds?: string[]
  }
}

function parseChannels(raw: unknown): ChannelInput[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const channels: ChannelInput[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const ch = item as Record<string, unknown>
    const id = str(ch.id)
    if (!id) continue
    channels.push({
      id,
      type: str(ch.type),
      uri: str(ch.uri),
      description: str(ch.description),
    })
  }
  return channels.length > 0 ? channels : undefined
}

function parsePlans(raw: unknown): PlanInput[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const plans: PlanInput[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const p = item as Record<string, unknown>
    const id = str(p.id)
    const name = str(p.name)
    if (!id || !name) continue
    plans.push({
      id,
      name,
      description: str(p.description),
      amount: typeof p.amount === 'number' ? p.amount : 0,
      currency: str(p.currency) ?? 'USD',
      frequency: str(p.frequency) ?? 'other',
      channels: Array.isArray(p.channels)
        ? p.channels.filter((c): c is string => typeof c === 'string')
        : undefined,
    })
  }
  return plans.length > 0 ? plans : undefined
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

  const channels = parseChannels(b.channels)
  const plans = parsePlans(b.plans)

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
      channelIds: Array.isArray(ex.channelIds)
        ? ex.channelIds.filter((c): c is string => typeof c === 'string')
        : undefined,
      planIds: Array.isArray(ex.planIds)
        ? ex.planIds.filter((c): c is string => typeof c === 'string')
        : undefined,
    }
  }

  return {
    contributeUrl,
    dependencies: dependencies.length > 0 ? dependencies : undefined,
    channels,
    plans,
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
      await client.put(fund.at.funding.contribute, {
        url: uri(payload.contributeUrl),
        createdAt,
      })
    } else if (payload.existing?.contributeUrl) {
      // User cleared the contribute URL — delete the record
      try {
        await deleteWithFallback(client, FUND_CONTRIBUTE, 'self')
      } catch {
        // Record may already be gone
      }
    }

    // ── Dependencies: create/update new, delete removed ─────────────────
    if (payload.dependencies) {
      for (const dep of payload.dependencies) {
        await client.put(fund.at.graph.dependency, {
          subject: dep.uri,
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
          await deleteWithFallback(client, FUND_DEPENDENCY, prev.uri)
        } catch {
          // Record may already be gone
        }
      }
    }

    // ── Channels: write individual records, delete removed ──────────────
    if (payload.channels) {
      for (const ch of payload.channels) {
        await client.put(fund.at.funding.channel, {
          channelType: ch.type ?? 'other',
          ...(ch.uri && { uri: uri(ch.uri) }),
          ...(ch.description && { description: ch.description }),
          createdAt,
        }, { rkey: ch.id })
      }
    }

    // Delete channels that were in existing but not in the new list
    const newChannelIds = new Set(payload.channels?.map((c) => c.id) ?? [])
    for (const prevId of payload.existing?.channelIds ?? []) {
      if (!newChannelIds.has(prevId)) {
        try {
          await client.deleteRecord(FUND_CHANNEL, prevId)
        } catch {
          // Record may already be gone
        }
      }
    }

    // ── Plans: write individual records, delete removed ─────────────────
    if (payload.plans) {
      for (const p of payload.plans) {
        await client.put(fund.at.funding.plan, {
          name: p.name,
          ...(p.description && { description: p.description }),
          amount: Math.round(p.amount * 100), // store as cents
          currency: p.currency,
          frequency: p.frequency,
          ...(p.channels && p.channels.length > 0 && {
            channels: p.channels.map(c =>
              c.startsWith('at://')
                ? l.asStringFormat(c, 'at-uri')
                : l.asStringFormat(`at://${session.did}/fund.at.funding.channel/${c}`, 'at-uri')
            ),
          }),
          createdAt,
        }, { rkey: p.id })
      }
    }

    // Delete plans that were in existing but not in the new list
    const newPlanIds = new Set(payload.plans?.map((p) => p.id) ?? [])
    for (const prevId of payload.existing?.planIds ?? []) {
      if (!newPlanIds.has(prevId)) {
        try {
          await client.deleteRecord(FUND_PLAN, prevId)
        } catch {
          // Record may already be gone
        }
      }
    }

    // ── Declaration: ensure the account is discoverable ──────────────────
    await client.put(fund.at.actor.declaration, { createdAt })

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
