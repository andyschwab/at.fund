import { NextRequest, NextResponse } from 'next/server'
import { Client } from '@atproto/lex'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { normalizeStewardUri } from '@/lib/steward-uri'
import { xrpcQuery } from '@/lib/xrpc'
import type { StewardEntry } from '@/lib/steward-model'
import { logger } from '@/lib/logger'
import { PUBLIC_API } from '@/lib/constants'
import { mergeDeps } from '@/lib/merge-deps'

/**
 * Thin steward lookup — resolves a URI to a basic StewardEntry.
 * Handles DID resolution, profile fetch, fund.at records, and manual catalog.
 * Does NOT discover capabilities (feeds/labelers) or resolve dependencies.
 *
 * For full resolution including capabilities and deps, use /api/entry instead.
 */
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('uri')
  if (!raw) {
    return NextResponse.json({ error: 'Missing uri parameter' }, { status: 400 })
  }

  const stewardUri = normalizeStewardUri(raw)
  if (!stewardUri) {
    return NextResponse.json({ error: 'Invalid steward URI' }, { status: 400 })
  }

  try {
    const isDid = stewardUri.startsWith('did:')
    let stewardDid: string | null = null
    const hostname = isDid ? undefined : stewardUri

    if (isDid) {
      stewardDid = stewardUri
    } else {
      try {
        stewardDid = await lookupAtprotoDid(stewardUri)
      } catch (e) {
        logger.warn('steward: DNS lookup failed', {
          stewardUri,
          error: e instanceof Error ? e.message : 'DNS lookup failed',
        })
      }
    }

    // Resolve profile for handle + displayName
    let handle: string | undefined
    let profileName: string | undefined
    if (stewardDid) {
      try {
        const publicClient = new Client(PUBLIC_API)
        const data = await xrpcQuery<{
          profiles?: Array<{ did: string; handle?: string; displayName?: string }>
        }>(publicClient, 'app.bsky.actor.getProfiles', { actors: [stewardDid] })
        const profile = data.profiles?.[0]
        if (profile) {
          handle = profile.handle
          profileName = profile.displayName
        }
      } catch { /* profile fetch is best-effort */ }
    }

    // Try multi-key catalog lookup (DID, hostname, handle)
    const manual = lookupManualStewardRecord(stewardUri)
      ?? (stewardDid ? lookupManualStewardRecord(stewardDid) : null)
      ?? (hostname ? lookupManualStewardRecord(hostname) : null)
      ?? (handle ? lookupManualStewardRecord(handle) : null)

    // Best displayName: profile > hostname > handle > DID > URI
    const displayName = (profileName && !profileName.startsWith('did:'))
      ? profileName
      : hostname ?? handle ?? stewardUri

    // DID is required for a valid StewardEntry — if we can't resolve one,
    // return a minimal response with what we have but no typed entry.
    if (!stewardDid) {
      if (manual) {
        return NextResponse.json({
          uri: hostname ?? stewardUri,
          did: hostname ?? stewardUri,
          displayName,
          handle,
          tags: ['tool'],
          contributeUrl: manual.contributeUrl,
          dependencies: manual.dependencies,
          source: 'manual',
        } satisfies StewardEntry)
      }
      return NextResponse.json(
        { error: 'Could not resolve DID', stewardUri },
        { status: 404 },
      )
    }

    const uri = hostname ?? handle ?? stewardUri

    const base: Omit<StewardEntry, 'source'> = {
      uri,
      did: stewardDid,
      handle,
      tags: ['tool'],
      displayName,
    }

    // Try fund.at records
    try {
      const fundAt = await fetchFundAtForStewardDid(stewardDid)
      if (fundAt) {
        const entry: StewardEntry = {
          ...base,
          contributeUrl: fundAt.contributeUrl ?? manual?.contributeUrl,
          dependencies: mergeDeps(
            fundAt.dependencies?.map((d) => d.uri),
            manual?.dependencies,
          ),
          source: 'fund.at',
        }
        return NextResponse.json(entry)
      }
    } catch (e) {
      logger.warn('steward: fund.at fetch failed', {
        stewardUri, stewardDid,
        error: e instanceof Error ? e.message : 'Failed to fetch fund.at records',
      })
    }

    // Manual catalog fallback
    if (manual) {
      const entry: StewardEntry = {
        ...base,
        contributeUrl: manual.contributeUrl,
        dependencies: manual.dependencies,
        source: 'manual',
      }
      return NextResponse.json(entry)
    }

    // Unknown
    return NextResponse.json({ ...base, source: 'unknown' } as StewardEntry)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to resolve steward'
    logger.error('steward: resolve failed', { stewardUri, error: message })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

