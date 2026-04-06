import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client, l } from '@atproto/lex'
import * as fund from '@/lexicons/fund'
import { logger } from '@/lib/logger'

/**
 * POST /api/migrate
 *
 * One-time migration: reads legacy fund.at.* records, writes them under
 * the new grouped NSIDs (fund.at.funding.*, fund.at.graph.*), then deletes
 * the legacy records. Also ensures a fund.at.actor.declaration exists.
 */
export async function POST() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const client = new Client(session)
  const createdAt = l.toDatetimeString(new Date())
  const uri = (v: string) => l.asStringFormat(v, 'uri')

  const migrated: string[] = []
  const errors: string[] = []

  // ── Migrate fund.at.contribute → fund.at.funding.contribute ──────────
  try {
    const res = await client.get(fund.at.contribute)
    if (res.value.url) {
      await client.put(fund.at.funding.contribute, {
        url: uri(res.value.url),
        createdAt,
      })
      await client.deleteRecord('fund.at.contribute', 'self')
      migrated.push('contribute')
    }
  } catch {
    // No legacy contribute record — skip
  }

  // ── Migrate fund.at.dependency → fund.at.graph.dependency ────────────
  try {
    const res = await client.list(fund.at.dependency, { limit: 100 })
    for (const r of res.records) {
      try {
        const legacyUri = r.value.uri?.trim()
        if (!legacyUri) continue
        const label = r.value.label?.trim() || undefined
        await client.put(fund.at.graph.dependency, {
          subject: legacyUri,
          ...(label && { label }),
          createdAt,
        }, { rkey: legacyUri })
        // Delete legacy record — extract rkey from AT URI
        const rkey = r.uri.split('/').pop()
        if (rkey) await client.deleteRecord('fund.at.dependency', rkey)
      } catch (e) {
        errors.push(`dependency ${r.uri}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (res.records.length > 0) migrated.push('dependency')
  } catch {
    // No legacy dependency records — skip
  }

  // ── Migrate fund.at.endorse → fund.at.graph.endorse ──────────────────
  try {
    const res = await client.list(fund.at.endorse, { limit: 100 })
    for (const r of res.records) {
      try {
        const legacyUri = r.value.uri?.trim()
        if (!legacyUri) continue
        await client.put(fund.at.graph.endorse, {
          subject: legacyUri,
          createdAt,
        }, { rkey: legacyUri })
        const rkey = r.uri.split('/').pop()
        if (rkey) await client.deleteRecord('fund.at.endorse', rkey)
      } catch (e) {
        errors.push(`endorse ${r.uri}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (res.records.length > 0) migrated.push('endorse')
  } catch {
    // No legacy endorse records — skip
  }

  // ── Migrate fund.at.manifest → individual channel + plan records ──────
  try {
    const res = await client.get(fund.at.manifest)
    const val = res.value as Record<string, unknown>
    const channels = val.channels as Array<Record<string, unknown>> | undefined
    if (Array.isArray(channels) && channels.length > 0) {
      // Write individual channel records
      for (const ch of channels) {
        const rkey = String(ch.channelId ?? ch.id ?? '')
        if (!rkey) continue
        try {
          await client.put(fund.at.funding.channel, {
            channelType: String(ch.channelType ?? ch.type ?? 'other'),
            ...(ch.uri ? { uri: uri(String(ch.uri)) } : {}),
            ...(ch.description ? { description: String(ch.description) } : {}),
            createdAt,
          }, { rkey })
        } catch (e) {
          errors.push(`channel ${rkey}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // Write individual plan records
      if (Array.isArray(val.plans)) {
        for (const p of val.plans as Array<Record<string, unknown>>) {
          const rkey = String(p.planId ?? p.id ?? '')
          if (!rkey) continue
          try {
            await client.put(fund.at.funding.plan, {
              name: String(p.name ?? ''),
              ...(p.description ? { description: String(p.description) } : {}),
              ...(typeof p.amount === 'number' ? { amount: Math.round(p.amount * 100) } : {}),
              ...(p.currency ? { currency: String(p.currency) } : {}),
              ...(p.frequency ? { frequency: String(p.frequency) } : {}),
              ...(Array.isArray(p.channels)
                ? {
                    // Legacy channels were channelId refs — convert to AT URIs
                    // pointing to the same account's new channel records
                    channels: p.channels.map((c: unknown) => {
                      const id = typeof c === 'object' && c && 'channelId' in c
                        ? String((c as Record<string, unknown>).channelId)
                        : typeof c === 'string' ? c : ''
                      return id ? l.asStringFormat(
                        `at://${session.did}/fund.at.funding.channel/${id}`,
                        'at-uri',
                      ) : null
                    }).filter((v): v is NonNullable<typeof v> => v !== null),
                  }
                : {}),
              createdAt,
            }, { rkey })
          } catch (e) {
            errors.push(`plan ${rkey}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
      }

      await client.deleteRecord('fund.at.manifest', 'self')
      migrated.push('manifest→channels+plans')
    }
  } catch {
    // No legacy manifest record — skip
  }

  // ── Ensure fund.at.actor.declaration exists ───────────────────────────
  try {
    await client.get(fund.at.actor.declaration)
  } catch {
    // Doesn't exist yet — create it
    try {
      await client.put(fund.at.actor.declaration, { createdAt })
      migrated.push('declaration')
    } catch (e) {
      errors.push(`declaration: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  logger.info('migrate: complete', {
    did: session.did,
    migrated,
    errors: errors.length > 0 ? errors : undefined,
  })

  return NextResponse.json({
    success: true,
    migrated,
    ...(errors.length > 0 && { errors }),
  })
}
