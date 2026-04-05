// ---------------------------------------------------------------------------
// Types — subset of funding.json v1 spec (fundingjson.org)
// We parse only what we display; we are a reader, not a validator.
// ---------------------------------------------------------------------------

export type FundingChannel = {
  guid: string
  type: 'bank' | 'payment-provider' | 'cheque' | 'cash' | 'other'
  address: string
  description?: string
}

export type FundingPlan = {
  guid: string
  status: 'active' | 'inactive'
  name: string
  description?: string
  amount: number
  currency: string // ISO 4217
  frequency:
    | 'one-time'
    | 'weekly'
    | 'fortnightly'
    | 'monthly'
    | 'yearly'
    | 'other'
  channels: string[] // references Channel GUIDs
}

export type FundingHistory = {
  year: number
  income: number
  expenses: number
  taxes: number
  currency: string
  description?: string
}

export type FundingManifest = {
  version: string
  entity: {
    type: string
    role: string
    name: string
    description: string
  }
  funding: {
    channels: FundingChannel[]
    plans: FundingPlan[]
    history?: FundingHistory[]
  }
}

// ---------------------------------------------------------------------------
// Known platform detection from channel addresses
// ---------------------------------------------------------------------------

export type KnownPlatform =
  | 'github-sponsors'
  | 'open-collective'
  | 'ko-fi'
  | 'patreon'
  | 'liberapay'
  | 'buy-me-a-coffee'
  | 'stripe'
  | 'paypal'

const PLATFORM_PATTERNS: [RegExp, KnownPlatform][] = [
  [/github\.com\/sponsors\//i, 'github-sponsors'],
  [/opencollective\.com\//i, 'open-collective'],
  [/ko-fi\.com\//i, 'ko-fi'],
  [/patreon\.com\//i, 'patreon'],
  [/liberapay\.com\//i, 'liberapay'],
  [/buymeacoffee\.com\//i, 'buy-me-a-coffee'],
  [/stripe\.com\//i, 'stripe'],
  [/paypal\.(com|me)\//i, 'paypal'],
]

/** Best-effort platform detection from a channel address URL. */
export function detectPlatform(address: string): KnownPlatform | null {
  for (const [pattern, platform] of PLATFORM_PATTERNS) {
    if (pattern.test(address)) return platform
  }
  return null
}

export const PLATFORM_LABELS: Record<KnownPlatform, string> = {
  'github-sponsors': 'GitHub Sponsors',
  'open-collective': 'Open Collective',
  'ko-fi': 'Ko-fi',
  'patreon': 'Patreon',
  'liberapay': 'Liberapay',
  'buy-me-a-coffee': 'Buy Me a Coffee',
  'stripe': 'Stripe',
  'paypal': 'PayPal',
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

const FUNDING_JSON_TIMEOUT = 5_000

/**
 * Attempt to fetch a funding.json from a steward's domain.
 * Returns null on any failure — this is always best-effort.
 */
export async function fetchFundingManifest(
  hostname: string,
): Promise<FundingManifest | null> {
  const url = `https://${hostname}/funding.json`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FUNDING_JSON_TIMEOUT),
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('json') && !contentType.includes('text')) return null

    const json = await res.json()
    return parseFundingManifest(json)
  } catch {
    return null // network error, timeout, invalid JSON — all fine
  }
}

/**
 * Leniently parse a funding.json payload. Returns null if the minimum
 * required structure is missing.
 */
export function parseFundingManifest(json: unknown): FundingManifest | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>

  // Must be v1.x
  if (typeof obj.version !== 'string' || !obj.version.startsWith('v1')) return null

  // Must have funding.channels
  const funding = obj.funding as Record<string, unknown> | undefined
  if (!funding || typeof funding !== 'object') return null
  if (!Array.isArray(funding.channels) || funding.channels.length === 0) return null

  // Validate channels minimally
  const channels: FundingChannel[] = []
  for (const ch of funding.channels) {
    if (!ch || typeof ch !== 'object') continue
    const c = ch as Record<string, unknown>
    if (typeof c.guid !== 'string' || typeof c.address !== 'string') continue
    channels.push({
      guid: c.guid,
      type: (['bank', 'payment-provider', 'cheque', 'cash', 'other'] as const).includes(
        c.type as FundingChannel['type'],
      )
        ? (c.type as FundingChannel['type'])
        : 'other',
      address: c.address,
      description: typeof c.description === 'string' ? c.description : undefined,
    })
  }
  if (channels.length === 0) return null

  // Parse plans (optional but useful)
  const plans: FundingPlan[] = []
  if (Array.isArray(funding.plans)) {
    for (const pl of funding.plans) {
      if (!pl || typeof pl !== 'object') continue
      const p = pl as Record<string, unknown>
      if (typeof p.guid !== 'string' || typeof p.name !== 'string') continue
      plans.push({
        guid: p.guid,
        status: p.status === 'inactive' ? 'inactive' : 'active',
        name: p.name,
        description: typeof p.description === 'string' ? p.description : undefined,
        amount: typeof p.amount === 'number' ? p.amount : 0,
        currency: typeof p.currency === 'string' ? p.currency : 'USD',
        frequency: (['one-time', 'weekly', 'fortnightly', 'monthly', 'yearly', 'other'] as const)
          .includes(p.frequency as FundingPlan['frequency'])
          ? (p.frequency as FundingPlan['frequency'])
          : 'other',
        channels: Array.isArray(p.channels)
          ? p.channels.filter((c): c is string => typeof c === 'string')
          : [],
      })
    }
  }

  // Parse history (optional)
  const history: FundingHistory[] = []
  if (Array.isArray(funding.history)) {
    for (const h of funding.history) {
      if (!h || typeof h !== 'object') continue
      const hi = h as Record<string, unknown>
      if (typeof hi.year !== 'number') continue
      history.push({
        year: hi.year,
        income: typeof hi.income === 'number' ? hi.income : 0,
        expenses: typeof hi.expenses === 'number' ? hi.expenses : 0,
        taxes: typeof hi.taxes === 'number' ? hi.taxes : 0,
        currency: typeof hi.currency === 'string' ? hi.currency : 'USD',
        description: typeof hi.description === 'string' ? hi.description : undefined,
      })
    }
  }

  // Parse entity (best-effort)
  const rawEntity = obj.entity as Record<string, unknown> | undefined
  const entity = {
    type: typeof rawEntity?.type === 'string' ? rawEntity.type : 'other',
    role: typeof rawEntity?.role === 'string' ? rawEntity.role : 'other',
    name: typeof rawEntity?.name === 'string' ? rawEntity.name : '',
    description: typeof rawEntity?.description === 'string' ? rawEntity.description : '',
  }

  return {
    version: obj.version as string,
    entity,
    funding: {
      channels,
      plans,
      history: history.length > 0 ? history : undefined,
    },
  }
}
