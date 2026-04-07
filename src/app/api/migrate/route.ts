import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client, l } from '@atproto/lex'
import * as fund from '@/lexicons/fund'
import { LEGACY_CONTRIBUTE, LEGACY_DEPENDENCY, LEGACY_ENDORSE, resolveDidFromIdentifier } from '@/lib/fund-at-records'
import { logger } from '@/lib/logger'

/**
 * POST /api/migrate
 *
 * One-time migration: reads legacy flat-namespace records (fund.at.contribute,
 * fund.at.dependency, fund.at.endorse), writes them under the new grouped
 * NSIDs (fund.at.funding.*, fund.at.graph.*), then deletes the legacy records.
 * Also ensures a fund.at.actor.declaration exists.
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
      await client.deleteRecord(LEGACY_CONTRIBUTE as `${string}.${string}.${string}`, 'self')
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
        const rkey = r.uri.split('/').pop()
        const legacyUri = r.value.uri?.trim()
        if (legacyUri) {
          // Resolve non-DID identifiers (handles, hostnames) to DIDs
          const did = await resolveDidFromIdentifier(legacyUri)
          if (did) {
            const label = r.value.label?.trim() || undefined
            await client.put(fund.at.graph.dependency, {
              subject: did,
              ...(label && { label }),
              createdAt,
            }, { rkey: did })
          }
        }
        // Always delete the legacy record
        if (rkey) await client.deleteRecord(LEGACY_DEPENDENCY as `${string}.${string}.${string}`, rkey)
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
        const rkey = r.uri.split('/').pop()
        const legacyUri = r.value.uri?.trim()
        if (legacyUri) {
          // Resolve non-DID identifiers (handles, hostnames) to DIDs
          const did = await resolveDidFromIdentifier(legacyUri)
          if (did) {
            await client.put(fund.at.graph.endorse, {
              subject: did,
              createdAt,
            }, { rkey: did })
          }
        }
        // Always delete the legacy record
        if (rkey) await client.deleteRecord(LEGACY_ENDORSE as `${string}.${string}.${string}`, rkey)
      } catch (e) {
        errors.push(`endorse ${r.uri}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (res.records.length > 0) migrated.push('endorse')
  } catch {
    // No legacy endorse records — skip
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
