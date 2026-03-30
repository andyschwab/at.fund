import type { DisclosureMeta, FundLink } from '@/lib/fund-at-records'

export type StewardSource = 'fund.at' | 'manual' | 'unknown'

type StewardDisclosureExtras = Omit<
  DisclosureMeta,
  'displayName' | 'description' | 'landingPage'
>

export type StewardCardModel = {
  stewardUri: string
  /** Present when stewardUri is a DID or hostname resolves to a DID. */
  stewardDid?: string
  displayName: string
  description?: string
  landingPage?: string
  links?: FundLink[]
  dependencies?: string[]
  source: StewardSource
} & Partial<StewardDisclosureExtras>
