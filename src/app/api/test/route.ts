import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@atproto/lex'
import type { AtIdentifierString } from '@atproto/lex-client'
import { extractPdsUrl } from '@atproto/did'
import type { AtprotoDidDocument } from '@atproto/did'
import * as fund from '@/lexicons/fund'
import { xrpcQuery } from '@/lib/xrpc'
import { fetchFundAtRecords, resolvePdsUrl } from '@/lib/fund-at-records'

const PUBLIC_API = 'https://public.api.bsky.app'

/**
 * Diagnostic endpoint for testing fund.at record resolution.
 *
 * GET /api/test?did=did:plc:...
 * GET /api/test?handle=someone.bsky.social
 *
 * Returns step-by-step results showing exactly where the resolution
 * chain succeeds or fails.
 */
export async function GET(request: NextRequest) {
  const did = request.nextUrl.searchParams.get('did')?.trim()
  const handle = request.nextUrl.searchParams.get('handle')?.trim()

  if (!did && !handle) {
    return NextResponse.json(
      { error: 'Provide ?did=did:plc:... or ?handle=someone.bsky.social' },
      { status: 400 },
    )
  }

  const steps: Array<{ step: string; status: 'ok' | 'fail' | 'skip'; data?: unknown; error?: string }> = []

  // Step 1: Resolve handle to DID if needed
  let resolvedDid = did
  if (!resolvedDid && handle) {
    try {
      const publicClient = new Client(PUBLIC_API)
      const res = await xrpcQuery<{ did: string }>(
        publicClient,
        'com.atproto.identity.resolveHandle',
        { handle },
      )
      resolvedDid = res.did
      steps.push({ step: 'resolve-handle', status: 'ok', data: { handle, did: resolvedDid } })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      steps.push({ step: 'resolve-handle', status: 'fail', error: msg })
      return NextResponse.json({ steps, summary: 'Failed to resolve handle to DID' })
    }
  } else {
    steps.push({ step: 'resolve-handle', status: 'skip', data: { did: resolvedDid } })
  }

  // Step 2: Resolve DID to PDS URL via plc.directory
  let pdsUrl: URL | null = null
  try {
    const plcRes = await fetch(`https://plc.directory/${encodeURIComponent(resolvedDid!)}`)
    if (plcRes.ok) {
      const didDoc = await plcRes.json()
      steps.push({
        step: 'plc-directory',
        status: 'ok',
        data: {
          id: (didDoc as Record<string, unknown>).id,
          alsoKnownAs: (didDoc as Record<string, unknown>).alsoKnownAs,
          serviceCount: Array.isArray((didDoc as Record<string, unknown>).service)
            ? ((didDoc as Record<string, unknown>).service as unknown[]).length
            : 0,
        },
      })

      try {
        pdsUrl = extractPdsUrl(didDoc as AtprotoDidDocument)
        steps.push({
          step: 'extract-pds-url',
          status: 'ok',
          data: { pdsUrl: pdsUrl.origin },
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        steps.push({ step: 'extract-pds-url', status: 'fail', error: msg })
      }
    } else {
      steps.push({ step: 'plc-directory', status: 'fail', error: `HTTP ${plcRes.status}` })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    steps.push({ step: 'plc-directory', status: 'fail', error: msg })
  }

  // Also check what resolvePdsUrl returns (our helper)
  const helperPdsUrl = await resolvePdsUrl(resolvedDid!)
  steps.push({
    step: 'resolvePdsUrl-helper',
    status: helperPdsUrl ? 'ok' : 'fail',
    data: { pdsUrl: helperPdsUrl?.origin ?? null },
  })

  // Step 3: Try fetching fund.at.contribute directly from the PDS
  if (pdsUrl) {
    const pdsClient = new Client(pdsUrl.origin)
    const repo = resolvedDid as AtIdentifierString

    // 3a: Try typed get() for fund.at.contribute
    try {
      const res = await pdsClient.get(fund.at.contribute, { repo })
      steps.push({
        step: 'pds-get-contribute',
        status: 'ok',
        data: { value: res.value },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      steps.push({ step: 'pds-get-contribute', status: 'fail', error: msg })
    }

    // 3b: Try typed list() for fund.at.dependency
    try {
      const res = await pdsClient.list(fund.at.dependency, { repo, limit: 10 })
      steps.push({
        step: 'pds-list-dependency',
        status: 'ok',
        data: {
          count: res.records.length,
          records: res.records.map((r) => ({ uri: r.value.uri, label: r.value.label })),
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      steps.push({ step: 'pds-list-dependency', status: 'fail', error: msg })
    }

    // 3c: Try typed list() for fund.at.endorse
    try {
      const res = await pdsClient.list(fund.at.endorse, { repo, limit: 10 })
      steps.push({
        step: 'pds-list-endorse',
        status: 'ok',
        data: {
          count: res.records.length,
          records: res.records.map((r) => ({ uri: r.value.uri })),
        },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      steps.push({ step: 'pds-list-endorse', status: 'fail', error: msg })
    }
  } else {
    steps.push({ step: 'pds-get-contribute', status: 'skip', error: 'No PDS URL resolved' })
    steps.push({ step: 'pds-list-dependency', status: 'skip', error: 'No PDS URL resolved' })
    steps.push({ step: 'pds-list-endorse', status: 'skip', error: 'No PDS URL resolved' })
  }

  // Step 4: Try the high-level fetchFundAtRecords (what follow-scan uses)
  try {
    const result = await fetchFundAtRecords(resolvedDid!)
    steps.push({
      step: 'fetchFundAtRecords',
      status: result ? 'ok' : 'fail',
      data: result ?? { note: 'returned null' },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    steps.push({ step: 'fetchFundAtRecords', status: 'fail', error: msg })
  }

  // Summary
  const failed = steps.filter((s) => s.status === 'fail')
  const summary = failed.length === 0
    ? 'All steps passed'
    : `Failed at: ${failed.map((s) => s.step).join(', ')}`

  return NextResponse.json({ did: resolvedDid, steps, summary })
}
