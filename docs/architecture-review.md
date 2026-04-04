# Architecture Review

_Last updated: 2026-04-04_

This document captures findings from a comprehensive codebase review and tracks
refactoring progress.

---

## 1. Duplicate Code (Mechanical Extractions)

These are pure copy-paste duplicates requiring no logic changes — just extract
and import.

| Pattern | Copies | Status |
|---------|--------|--------|
| `PUBLIC_API` constant | 9 files → `lib/constants.ts` | **done** |
| `PROFILE_BATCH` / `FEED_BATCH` constants | 4 files → `lib/constants.ts` | **done** |
| `mergeDeps()` | 4 files → `lib/merge-deps.ts` | **done** |
| `runWithConcurrency()` | 4 files → `lib/concurrency.ts` | **done** |
| `str()` validator | 2 API routes → `lib/str.ts` | **done** |
| `nextId()` generator | 2 files → `lib/next-id.ts` | **done** |
| `useDebounce` hook | 2 components → `hooks/useDebounce.ts` | **done** |
| `AvatarBadge` component | 2 components → `components/AvatarBadge.tsx` | **done** |
| `cardType()` + `LINK_VARIANT` | 2 card files → `components/card-utils.ts` | **done** |

## 2. Canonical Type System & Resolution Layer

Previously, the same identity resolution question was answered differently in
6+ places (display name heuristic, URI preference, landing page derivation,
funding chain, profile batch fetch). This was caused by a flat `StewardEntry`
type used at every lifecycle stage, plus 5 ad-hoc types (`AccountStub`,
`FollowedAccountCard`, `Actor`, `DisplayInfo`, `UnresolvedService`) all
representing "an AT Protocol identity."

### Canonical Types (new)

| Type | Location | Purpose |
|------|----------|---------|
| `Identity` | `lib/steward-model.ts` | Resolved presentation: uri, did, handle, displayName, avatar, landingPage |
| `Funding` | `lib/steward-model.ts` | How to contribute: source, contributeUrl, dependencies |
| `StewardEntry` | `lib/steward-model.ts` | `Identity & Funding & { tags, capabilities }` — backwards-compatible composition |
| `ProfileData` | `lib/steward-model.ts` | Raw profile fields from batch fetch |

### Resolution Layer (new)

| Function | Location | Replaces |
|----------|----------|----------|
| `buildIdentity(input)` | `lib/identity.ts` | 6 ad-hoc display name + URI + landing page derivations |
| `isHumanReadableName(name)` | `lib/identity.ts` | 6 `!name.startsWith('did:')` checks |
| `batchFetchProfiles(dids)` | `lib/identity.ts` | 4 identical batch-fetch loops |
| `resolveRefToDid(ref)` | `lib/identity.ts` | 3 separate handle/DNS resolution paths |
| `resolveIdentity(ref)` | `lib/identity.ts` | Convenience composition for single-entry resolution |
| `resolveFunding(identity)` | `lib/funding.ts` | 4 fund.at → manual → unknown chains |
| `resolveFundingForDep(identity)` | `lib/funding.ts` | Public (no-auth) variant for dependency resolution |
| `lookupManualByIdentity(identity)` | `lib/funding.ts` | 3 multi-key catalog lookup implementations |

### Types Eliminated

| Old Type | Replaced By | Status |
|----------|-------------|--------|
| `FollowedAccountCard` | `StewardEntry` (follow-scan returns entries directly) | **done** |
| `DisplayInfo` | `buildIdentity` input | **done** |
| `followedAccountToEntry()` | No longer needed | **done** |
| `lookupByAllKeys()` | `lookupManualByIdentity()` | **done** |

### Pipeline Refactored

| Module | Change | Status |
|--------|--------|--------|
| `account-enrich.ts` | Uses `buildIdentity` + `resolveFunding` | **done** |
| `entry-resolve.ts` | Uses `resolveIdentity` + `resolveFunding` | **done** |
| `dep-resolve.ts` | Uses `buildIdentity` + `resolveRefToDid` + `resolveFundingForDep` | **done** |
| `follow-scan.ts` | Uses `buildIdentity` + `resolveFundingForDep`, returns `StewardEntry[]` | **done** |
| `subscriptions-scan.ts` | Uses `buildIdentity` + `resolveFunding` + `batchFetchProfiles` | **done** |
| `steward-merge.ts` | Uses `isHumanReadableName`, simplified `mergeIntoEntries(...lists)` | **done** |

## 3. Shared Hooks & Unified Functions

### useTypeahead hook

`HandleAutocomplete` and `HandleChipInput` shared ~90% of their logic
(debounced fetch, outside-click, arrow navigation, dropdown rendering).
Extracted:

| Module | Purpose | Status |
|--------|---------|--------|
| `hooks/useTypeahead.ts` | Debounced fetch, outside-click, state management | **done** |
| `components/SuggestionList.tsx` | Shared dropdown rendering with AvatarBadge | **done** |
| `HandleAutocomplete.tsx` | Now ~120 lines (was ~215) | **done** |
| `HandleChipInput.tsx` | Now ~185 lines (was ~265) | **done** |

### Unified entry priority

Three separate tiering functions (`stewardTier`, `entryTier`, `depRowTier`)
all answered "how fundable is this entry?" with different scales. Unified into
a single `entryPriority(entry, lookup?)` in `lib/entry-priority.ts`.

| Old Function | Location | Status |
|-------------|----------|--------|
| `stewardTier()` | `lexicon-scan.ts` | Replaced by `entryPriority` — **done** |
| `entryTier()` | `GiveClient.tsx` | Replaced by `entryPriority` — **done** |
| `depRowTier()` | `card-primitives.tsx` | Replaced by `entryPriority` — **done** |

Note: `SOURCE_PRIORITY` in steward-merge.ts is a different concern (merge
conflict resolution, not display ordering) and remains separate.

### AccountStub → GatheredAccount

Renamed `AccountStub` to `GatheredAccount` with documentation connecting it to
the Identity type lifecycle. The gather phase collects raw pre-resolution data;
the enrich phase calls `buildIdentity()` to produce proper Identity objects.

### Endorsement type consolidation

Three overlapping types collapsed into two:

| Old Type | New | Status |
|----------|-----|--------|
| `EndorsementCounts` (ecosystem-scan) | Moved to `microcosm.ts`, single `networkEndorsementCount` field | **done** |
| `EndorsementResult` (microcosm) | Eliminated — `getCountsFromMap` returns `EndorsementCounts` directly | **done** |
| `EndorsementMap` (microcosm) | Unchanged — core data structure | — |

The vestigial `endorsementCount` field (always equal to `networkEndorsementCount`)
and unused `endorserDids` return value were removed.

## 4. Remaining Opportunities

### Migrate lexicon-scan.ts to resolution layer

`lexicon-scan.ts` still has its own inline resolution chain (fund.at → manual →
unknown) in both `scanRepo()` and `scanRepoStreaming()`. These should be
migrated to use `buildIdentity` + `resolveFunding`.

### Decompose GiveClient.tsx

695 lines, 8+ responsibilities. Extract `useScanStream()` hook and focused
sub-components (StewardSection, EcosystemSection, etc.).

### Other

| Issue | Location | Severity |
|-------|----------|----------|
| Three independent avatar implementations | `src/components/` | Low |
| Card actions duplicated in StewardCard + ModalCardContent | `src/components/` | Low |
| `Actor` in AvatarBadge | Small UI-specific type (handle required); acceptable | — |
