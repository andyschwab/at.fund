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

## 4. Pipeline Unification & Component Decomposition

### lexicon-scan.ts → pipeline wrapper

`scanRepo()` was a 540-line parallel implementation of the streaming pipeline.
Replaced with a thin wrapper that calls the pipeline phases directly:
`gatherAccounts` → `enrichAccounts` → `attachCapabilities` → `resolveDependencies`.

| Change | Status |
|--------|--------|
| Delete dead `scanRepoStreaming()` (superseded by `scan-stream.ts`) | **done** |
| Replace `scanRepo()` inline resolution with pipeline phases | **done** |
| Existing 12 test cases pass unchanged (same mocks, same contracts) | **done** |

Result: `lexicon-scan.ts` reduced from 537 lines to 103 lines. One code path
for both batch and streaming scans.

### GiveClient.tsx decomposition

Extracted `useScanStream()` hook from `GiveClient.tsx`:

| Module | Responsibility | Lines |
|--------|---------------|-------|
| `hooks/useScanStream.ts` | NDJSON fetch, EntryIndex, cache, event parsing | ~150 |
| `GiveClient.tsx` | Derived state, endorsement handlers, layout | ~490 |

GiveClient reduced from 678 to ~490 lines. Endorsement handlers remain in the
component (tightly coupled to scan state).

## 5. Network Optimization — ScanContext & Speculative Prefetch

### Problem

Fund.at record fetching was the scan bottleneck. Each account required 3
sequential network calls: DID doc (PLC directory) → PDS contribute record →
PDS dependency records. For 500 follows this was ~1500 sequential calls.

### ScanContext

Introduced `ScanContext` (`lib/scan-context.ts`) as the app-wide network
orchestrator. Created once per scan session, threaded through every pipeline
phase and standalone resolver. All network-level concerns live here.

```typescript
type ScanContext = {
  readonly fundAtPrefetch: FundAtPrefetchMap
  readonly prefetch: (did: string) => void          // bounded concurrency
  readonly prefetchUnbounded: (did: string) => void  // late discovery
}
```

| Consumer | How it gets ctx |
|----------|----------------|
| `scanStreaming()` | Creates it |
| `scanRepo()` | Creates it |
| `gatherAccounts()` | Receives from orchestrator (creates fallback if none) |
| `enrichAccounts()` | Receives from orchestrator |
| `resolveDependencies()` | Receives from orchestrator |
| `scanFollows()` | Optional — creates own if standalone |
| `scanSubscriptions()` | Optional — creates own if standalone |
| `resolveEntry()` | Optional — creates own if standalone |
| `resolveFunding()` | Checks `ctx.fundAtPrefetch` before fetching |
| `resolveFundingForDep()` | Same |

### Speculative prefetch

`fund-at-prefetch.ts` provides a bounded-concurrency (20 parallel) prefetch
controller. As Phase 1 discovers DIDs (follows arrive in pages of 100, tool
stewards resolve individually), it fires `ctx.prefetch(did)` for each. The
promise is stored in `FundAtPrefetchMap`. Later phases await these
already-in-flight promises instead of issuing their own fetches.

| Change | Status |
|--------|--------|
| `fetchFundAtRecords` parallelizes contribute + dependency PDS calls | **done** |
| `fetchFundAtRecords` accepts optional `pdsUrl` to skip DID doc fetch | **done** |
| Prefetch controller with bounded concurrency (20) | **done** |
| Phase 1 fires prefetches as DIDs are discovered | **done** |
| `resolveFunding` / `resolveFundingForDep` check prefetch map first | **done** |
| ScanContext threaded through all pipeline phases | **done** |
| Standalone scans (follow, subscriptions, entry-resolve) accept ScanContext | **done** |
| Ecosystem discovery fires `prefetchUnbounded` for late-discovered DIDs | **done** |

### Net effect

Fund.at network calls now overlap almost entirely with Phase 1's follow
pagination. By the time Phase 2 starts enriching entries, most prefetch
promises have already resolved — turning what was sequential blocking work
into cache hits.

## 6. Setup Record Deletion Fix

The `/api/setup` route only wrote records via `put()` — it never deleted
records that were removed from the form.

| Bug | Fix | Status |
|-----|-----|--------|
| Clearing contribute URL left orphan record on PDS | `deleteRecord(FUND_CONTRIBUTE, 'self')` when URL cleared | **done** |
| Removing dependencies left orphan records on PDS | Diff new vs existing, `deleteRecord(FUND_DEPENDENCY, uri)` for removed | **done** |
| Clearing everything returned 400 | Accept empty payload as valid (delete all) | **done** |

The client now sends `existing` (the previous PDS state) alongside the form
data so the API can diff and delete removed records.

## 7. Remaining Low-Priority Items

| Issue | Location | Severity |
|-------|----------|----------|
| Three independent avatar implementations | `src/components/` | Low |
| Card actions duplicated in StewardCard + ModalCardContent | `src/components/` | Low |
| `Actor` in AvatarBadge | Small UI-specific type (handle required); acceptable | — |
