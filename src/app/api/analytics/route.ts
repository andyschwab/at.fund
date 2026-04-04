import { NextResponse } from 'next/server'
import { buildAnalyticsGraph } from '@/lib/analytics-graph'
import { logger } from '@/lib/logger'

/**
 * Public analytics endpoint — no authentication required.
 *
 * GET /api/analytics
 *
 * Returns the full AnalyticsGraph (nodes, edges, stats).
 * Results are cached in Redis (15-min TTL) to avoid redundant Microcosm calls.
 */
export async function GET() {
  try {
    const graph = await buildAnalyticsGraph()
    return NextResponse.json(graph)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to build analytics graph'
    logger.error('analytics: build failed', { error: message })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
