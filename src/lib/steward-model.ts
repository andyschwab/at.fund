import type { FundingChannel, FundingPlan } from '@/lib/funding-manifest'

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
 *
 * DID is the canonical key — every Identity must have a resolved DID.
 * Handles and hostnames are display metadata only.
 */
export type Identity = {
  /** Canonical key — always the resolved DID. */
  uri: string
  /** Resolved DID. Always present — entities without a DID are dropped. */
  did: string
  /** Bluesky handle — present for accounts whose DID resolves a handle. */
  handle?: string
  /** Human-readable display name. */
  displayName: string
  description?: string
  /** Bluesky avatar URL. */
  avatar?: string
  /** Web link — bsky profile for accounts with a handle. */
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
  /** Payment channels from fund.at.funding.channel records or funding.json. */
  channels?: FundingChannel[]
  /** Funding plans/tiers from fund.at.funding.plan records or funding.json. */
  plans?: FundingPlan[]
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
  /** Resolved DID — required. Entities without a DID are dropped before reaching this point. */
  did: string
  handle?: string
  displayName?: string
  description?: string
  avatar?: string
}

/**
 * Assembles an Identity from resolved data. DID is the canonical key (uri = did).
 * Handle and hostname are display metadata only.
 *
 * Pure — no network calls. Safe for client-side import.
 */
export function buildIdentity(input: BuildIdentityInput): Identity {
  const { did, handle, description, avatar } = input

  // URI is always the DID — the canonical key
  const uri = did

  // Display name: profile name (if human-readable) > handle > DID
  const displayName = isHumanReadableName(input.displayName)
    ? input.displayName
    : handle ?? did

  // Accounts with a handle get a bsky profile link
  const landingPage = handle
    ? `https://bsky.app/profile/${handle}`
    : undefined

  return { uri, did, handle, displayName, description, avatar, landingPage }
}
