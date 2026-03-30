import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { Client, l } from '@atproto/lex'
import * as fund from '@/lexicons/fund'
import {
  validateUrl,
  validateEmail,
  validateHandle,
} from '@/lib/validate'
import { logger } from '@/lib/logger'

export type SetupPayload = {
  // fund.at.disclosure — meta
  displayName: string
  description?: string
  landingPage?: string
  // fund.at.disclosure — contact
  contactHandle?: string
  contactEmail?: string
  contactUrl?: string
  pressEmail?: string
  pressUrl?: string
  // fund.at.disclosure — security
  securityPolicyUri?: string
  securityContactUri?: string
  securityContactEmail?: string
  // fund.at.disclosure — legal
  legalEntityName?: string
  jurisdiction?: string
  privacyPolicyUri?: string
  termsOfServiceUri?: string
  donorTermsUri?: string
  taxDisclosureUri?: string
  softwareLicenseUri?: string
  // fund.at.contribute
  links?: Array<{ label: string; url: string }>
  // fund.at.dependencies
  dependencyUris?: string[]
  dependencyNotes?: string
}

function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t || undefined
}

function parsePayload(body: unknown): SetupPayload | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>

  const displayName = str(b.displayName)
  if (!displayName) return null

  const links: Array<{ label: string; url: string }> = []
  if (Array.isArray(b.links)) {
    for (const item of b.links) {
      if (!item || typeof item !== 'object') continue
      const label = str((item as Record<string, unknown>).label)
      const url = str((item as Record<string, unknown>).url)
      if (label && url) links.push({ label, url })
    }
  }

  const dependencyUris: string[] = []
  if (Array.isArray(b.dependencyUris)) {
    for (const u of b.dependencyUris) {
      const s = str(u)
      if (s) dependencyUris.push(s)
    }
  }

  return {
    displayName,
    description: str(b.description),
    landingPage: str(b.landingPage),
    contactHandle: str(b.contactHandle),
    contactEmail: str(b.contactEmail),
    contactUrl: str(b.contactUrl),
    pressEmail: str(b.pressEmail),
    pressUrl: str(b.pressUrl),
    securityPolicyUri: str(b.securityPolicyUri),
    securityContactUri: str(b.securityContactUri),
    securityContactEmail: str(b.securityContactEmail),
    legalEntityName: str(b.legalEntityName),
    jurisdiction: str(b.jurisdiction),
    privacyPolicyUri: str(b.privacyPolicyUri),
    termsOfServiceUri: str(b.termsOfServiceUri),
    donorTermsUri: str(b.donorTermsUri),
    taxDisclosureUri: str(b.taxDisclosureUri),
    softwareLicenseUri: str(b.softwareLicenseUri),
    links,
    dependencyUris,
    dependencyNotes: str(b.dependencyNotes),
  }
}

function validatePayload(
  p: SetupPayload,
): Record<string, string> | null {
  const issues: Record<string, string> = {}

  function chk(field: string, value: string | undefined, fn: (v: string) => string | null) {
    if (!value) return
    const err = fn(value)
    if (err) issues[field] = err
  }

  chk('landingPage', p.landingPage, validateUrl)
  chk('contactHandle', p.contactHandle, validateHandle)
  chk('contactEmail', p.contactEmail, validateEmail)
  chk('contactUrl', p.contactUrl, validateUrl)
  chk('pressEmail', p.pressEmail, validateEmail)
  chk('pressUrl', p.pressUrl, validateUrl)
  chk('securityPolicyUri', p.securityPolicyUri, validateUrl)
  chk('securityContactUri', p.securityContactUri, validateUrl)
  chk('securityContactEmail', p.securityContactEmail, validateEmail)
  chk('privacyPolicyUri', p.privacyPolicyUri, validateUrl)
  chk('termsOfServiceUri', p.termsOfServiceUri, validateUrl)
  chk('donorTermsUri', p.donorTermsUri, validateUrl)
  chk('taxDisclosureUri', p.taxDisclosureUri, validateUrl)
  chk('softwareLicenseUri', p.softwareLicenseUri, validateUrl)

  if (p.links) {
    for (let i = 0; i < p.links.length; i++) {
      const err = validateUrl(p.links[i]!.url)
      if (err) issues[`links[${i}].url`] = err
    }
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
      { error: 'displayName is required' },
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
  const effectiveDate = l.toDatetimeString(new Date())

  try {
    // Build optional nested objects
    const hasGeneralContact =
      payload.contactHandle || payload.contactEmail || payload.contactUrl
    const hasPressContact = payload.pressEmail || payload.pressUrl
    const hasSecurity =
      payload.securityPolicyUri || payload.securityContactUri || payload.securityContactEmail
    const hasLegal =
      payload.legalEntityName ||
      payload.jurisdiction ||
      payload.privacyPolicyUri ||
      payload.termsOfServiceUri ||
      payload.donorTermsUri ||
      payload.taxDisclosureUri ||
      payload.softwareLicenseUri

    await client.create(fund.at.disclosure, {
      meta: {
        ...(payload.displayName && { displayName: payload.displayName }),
        ...(payload.description && { description: payload.description }),
        ...(payload.landingPage && { landingPage: payload.landingPage }),
      },
      effectiveDate,
      ...((hasGeneralContact || hasPressContact) && {
        contact: {
          ...(hasGeneralContact && {
            general: {
              ...(payload.contactHandle && { handle: payload.contactHandle }),
              ...(payload.contactEmail && { email: payload.contactEmail }),
              ...(payload.contactUrl && { url: payload.contactUrl }),
            },
          }),
          ...(hasPressContact && {
            press: {
              ...(payload.pressEmail && { email: payload.pressEmail }),
              ...(payload.pressUrl && { url: payload.pressUrl }),
            },
          }),
        },
      }),
      ...(hasSecurity && {
        security: {
          ...(payload.securityPolicyUri && { policyUri: payload.securityPolicyUri }),
          ...(payload.securityContactEmail && { contactEmail: payload.securityContactEmail }),
          ...(payload.securityContactUri && { contactUri: payload.securityContactUri }),
        },
      }),
      ...(hasLegal && {
        legal: {
          ...(payload.jurisdiction && { jurisdiction: payload.jurisdiction }),
          ...(payload.legalEntityName && { legalEntityName: payload.legalEntityName }),
          ...(payload.termsOfServiceUri && { termsOfServiceUri: payload.termsOfServiceUri }),
          ...(payload.privacyPolicyUri && { privacyPolicyUri: payload.privacyPolicyUri }),
          ...(payload.donorTermsUri && { donorTermsUri: payload.donorTermsUri }),
          ...(payload.taxDisclosureUri && { taxDisclosureUri: payload.taxDisclosureUri }),
          ...(payload.softwareLicenseUri && { softwareLicenseUri: payload.softwareLicenseUri }),
        },
      }),
    })

    // Write fund.at.contribute if links are provided
    if (payload.links && payload.links.length > 0) {
      await client.create(fund.at.contribute, {
        links: payload.links,
        effectiveDate,
      })
    }

    // Write fund.at.dependencies if provided
    if (payload.dependencyUris && payload.dependencyUris.length > 0) {
      await client.create(fund.at.dependencies, {
        uris: payload.dependencyUris,
        ...(payload.dependencyNotes && { notes: payload.dependencyNotes }),
        effectiveDate,
      })
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
