export type StewardSource = 'fund.at' | 'manual' | 'unknown'

/**
 * How this steward was discovered. A single entry may carry multiple tags
 * when the same entity is found via more than one scan pass.
 */
export type StewardTag = 'tool' | 'labeler' | 'feed' | 'follow' | 'pds-host'

/**
 * Unified steward model. One entry per entity (deduped by DID),
 * with tags recording every discovery path that found it.
 */
export type StewardEntry = {
  /** Primary display/lookup key — hostname preferred over DID for readability. */
  uri: string
  /** Resolved DID. Used as the dedup key when present. */
  did?: string
  /** Bluesky handle — present for follows and stewards whose DID resolves a handle. */
  handle?: string

  /** How this entity was discovered. Multi-valued; unioned across scan passes. */
  tags: StewardTag[]

  displayName: string
  description?: string
  landingPage?: string

  contributeUrl?: string
  dependencies?: string[]
  /** Where the display data came from — orthogonal to tags. */
  source: StewardSource
}
