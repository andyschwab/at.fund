import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client } from '@atproto/lex'
import * as fund from '@/lexicons/fund'

/**
 * GET /api/migrate/check
 *
 * Lightweight check: returns { needsMigration: true } if the authenticated
 * user has any legacy flat-namespace records that should be migrated.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const client = new Client(session)

  // Probe all three legacy collections in parallel.
  // A missing collection throws — caught as "no legacy records".
  const [hasContribute, hasDependency, hasEndorse] = await Promise.all([
    client.get(fund.at.contribute).then(() => true).catch(() => false),
    client.list(fund.at.dependency, { limit: 1 }).then((r: { records: unknown[] }) => r.records.length > 0).catch(() => false),
    client.list(fund.at.endorse, { limit: 1 }).then((r: { records: unknown[] }) => r.records.length > 0).catch(() => false),
  ])

  return NextResponse.json({
    needsMigration: hasContribute || hasDependency || hasEndorse,
  })
}
