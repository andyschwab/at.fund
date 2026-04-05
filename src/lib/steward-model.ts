import type { FundingManifest } from '@/lib/funding-manifest'

export type StewardSource = 'fund.at' | 'manual' | 'unknown'

/**
 * How this steward was discovered. A single entry may carry multiple tags
 * when the same entity is found via more than one scan pass.
 */
export type StewardTag = 'tool' | 'labeler' | 'feed' | 'follow' | 'pds-host' | 'ecosystem' | 'dependency'

/**
 * A capability provided by an account — a feed, labeler, or personal data server it operates.
 */
export type Capability = {
  type: 'feed' | 'labeler' | 'pds'
  /** Human-readable name. */
  name: string
  description?: string
  /** The AT URI of the record (feeds/labelers only). */
  uri?: string
  /** Web link to the capability. */
  landingPage?: string
  /** For type 'pds': the entryway hostname (e.g. 'bsky.social'). */
  hostname?: string
}

// ---------------------------------------------------------------------------
// Identity — the resolved presentation of an AT Protocol entity.
// Owns display name, URI preference, and landing page derivation.
// ---------------------------------------------------------------------------

/**
 * The resolved presentation of an AT Protocol entity.
 * Produced by `buildIdentity()` in the identity resolution layer.
 */
export type Identity = {
  /** Primary display key — hostname preferred over handle preferred over DID. */
  uri: string
  /** Resolved DID. Used as the dedup key when present. */
  did?: string
  /** Bluesky handle — present for accounts whose DID resolves a handle. */
  handle?: string
  /** Human-readable display name. */
  displayName: string
  description?: string
  /** Bluesky avatar URL. */
  avatar?: string
  /** Web link — bsky profile for non-tools, undefined for tools. */
  landingPage?: string
}

// ---------------------------------------------------------------------------
// Funding — how an entity accepts contributions.
// Resolved via fund.at records, manual catalog, or marked unknown.
// ---------------------------------------------------------------------------

/**
 * How an entity accepts contributions.
 * Produced by `resolveFunding()` in the funding resolution layer.
 */
export type Funding = {
  /** Where the funding data came from — orthogonal to discovery tags. */
  source: StewardSource
  contributeUrl?: string
  dependencies?: string[]
  /** Structured funding manifest from ATProto record or funding.json. */
  fundingManifest?: FundingManifest
}

// ---------------------------------------------------------------------------
// Profile data — raw profile fields from batch fetch
// ---------------------------------------------------------------------------

export type ProfileData = {
  did: string
  handle?: string
  displayName?: string
  description?: string
  avatar?: string
}

// ---------------------------------------------------------------------------
// StewardEntry — the composition of Identity + Funding + discovery metadata.
// One entry per account (deduped by DID), with tags recording every
// discovery path that found it.
// ---------------------------------------------------------------------------

/**
 * Unified steward model. Composes Identity (who) + Funding (how to contribute)
 * with discovery metadata (how we found them, what they provide).
 */
export type StewardEntry = Identity & Funding & {
  /** How this entity was discovered. Multi-valued; unioned across scan passes. */
  tags: StewardTag[]
  /** Feeds and labelers this account provides. */
  capabilities?: Capability[]
  /** Optional enrichment from a funding.json manifest on the steward's domain. */
  fundingManifest?: FundingManifest
}

// ---------------------------------------------------------------------------
// Pure identity helpers — safe for client-side import.
// Async resolution functions live in lib/identity.ts (server-only).
// ---------------------------------------------------------------------------

/** Returns true when `name` is a non-empty string that doesn't look like a DID. */
export function isHumanReadableName(name: string | undefined | null): name is string {
  if (!name) return false
  return !name.startsWith('did:')
}

export type BuildIdentityInput = {
  /** Original identifier — hostname, handle, or DID. */
  ref: string
  did?: string
  handle?: string
  displayName?: string
  description?: string
  avatar?: string
  /**
   * Whether this entity was discovered as a tool (via repo collections).
   * Tools use hostname as URI; non-tools get a bsky profile landing page.
   */
  isTool?: boolean
}

/**
 * Assembles an Identity from resolved data, applying canonical rules for
 * URI preference, display name, and landing page.
 *
 * Pure — no network calls. Safe for client-side import.
 */
export function buildIdentity(input: BuildIdentityInput): Identity {
  const { ref, did, handle, description, avatar, isTool } = input
  const hostname = isTool && !ref.startsWith('did:') ? ref : undefined

  // URI preference: hostname > handle > DID > raw ref
  const uri = hostname ?? handle ?? did ?? ref

  // Display name: profile name (if human-readable) > hostname > handle > raw ref
  const displayName = isHumanReadableName(input.displayName)
    ? input.displayName
    : hostname ?? handle ?? ref

  // Landing page: non-tools with a handle get a bsky profile link
  const landingPage = !isTool && handle
    ? `https://bsky.app/profile/${handle}`
    : undefined

  return { uri, did, handle, displayName, description, avatar, landingPage }
}
