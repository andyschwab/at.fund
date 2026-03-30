import { NextRequest, NextResponse } from 'next/server'
import { lookupAtprotoDid } from '@/lib/atfund-dns'
import { lookupManualStewardRecord } from '@/lib/catalog'
import { fetchFundAtForStewardDid } from '@/lib/steward-funding'
import { normalizeStewardUri } from '@/lib/steward-uri'
import type { StewardCardModel } from '@/lib/steward-model'
import { logger } from '@/lib/logger'

/**
 * Resolve a single steward URI to its full StewardCardModel.
 * Does not require authentication — all data is public.
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

    const stewardDidOrUndefined = stewardDid ?? undefined
    const manual = lookupManualStewardRecord(stewardUri)

    if (stewardDid) {
      try {
        const fundAt = await fetchFundAtForStewardDid(stewardDid)
        if (fundAt) {
          const {
            displayName: dName,
            description: dDesc,
            landingPage: dLanding,
            ...disclosureExtras
          } = fundAt.disclosure
          const steward: StewardCardModel = {
            stewardUri,
            stewardDid: stewardDidOrUndefined,
            displayName: dName ?? manual?.displayName ?? stewardUri,
            description: dDesc ?? manual?.description,
            landingPage: dLanding,
            links: fundAt.links,
            dependencies: fundAt.dependencyUris,
            source: 'fund.at',
            ...disclosureExtras,
            contactGeneralHandle:
              fundAt.disclosure.contactGeneralHandle ?? manual?.contactGeneralHandle,
          }
          return NextResponse.json(steward)
        }
      } catch (e) {
        logger.warn('steward: fund.at fetch failed', {
          stewardUri,
          stewardDid,
          error: e instanceof Error ? e.message : 'Failed to fetch fund.at records',
        })
      }
    }

    if (manual) {
      const steward: StewardCardModel = {
        stewardUri,
        stewardDid: stewardDidOrUndefined,
        displayName: manual.displayName,
        description: manual.description,
        landingPage: manual.landingPage,
        contactGeneralHandle: manual.contactGeneralHandle,
        links: manual.links.length > 0 ? manual.links : undefined,
        dependencies: manual.dependencies,
        source: 'manual',
      }
      return NextResponse.json(steward)
    }

    const steward: StewardCardModel = {
      stewardUri,
      stewardDid: stewardDidOrUndefined,
      displayName: stewardUri,
      source: 'unknown',
    }
    return NextResponse.json(steward)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to resolve steward'
    logger.error('steward: resolve failed', { stewardUri, error: message })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
