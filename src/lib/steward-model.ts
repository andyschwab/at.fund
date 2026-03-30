export type StewardSource = 'fund.at' | 'manual' | 'unknown'

export type StewardLink = { label: string; url: string }

export type StewardCardModel = {
  stewardUri: string
  /** Present when stewardUri is a DID or hostname resolves to a DID. */
  stewardDid?: string
  displayName: string
  description?: string
  landingPage?: string
  links?: StewardLink[]
  dependencies?: string[]
  source: StewardSource
}

