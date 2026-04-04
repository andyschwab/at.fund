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

## 2. Edge Cases Masking Missing General Abstractions

These require design decisions — the same question is answered differently in
multiple places.

| Pattern | Occurrences | Notes |
|---------|-------------|-------|
| Display name vs DID heuristic | 5 implementations | Should be one `isHumanReadableName()` function |
| URI preference / fallback chains | 3 approaches | `steward-merge`, `entry-resolve`, `account-enrich` each pick differently |
| Landing page URL derivation | 3 places | "If not tool and has handle → bsky.app/profile/{handle}" |
| "Own records" auth branch | 3 occurrences | `if (stewardDid === session.did)` fork |
| Multi-key catalog lookup | 2 approaches | Chained `??` vs dedicated `lookupByAllKeys()` |
| Tiering / priority systems | 4 implementations | `SOURCE_PRIORITY`, `stewardTier`, `entryTier`, `depRowTier` |
| Entry resolution pattern | 3 modules | fund.at → manual → unknown fallback |
| Profile batch-fetch loop | 6 occurrences | Same `for` loop with `getProfiles` |

## 3. Component Architecture Issues

| Issue | Location | Severity |
|-------|----------|----------|
| `GiveClient.tsx` (695 lines, 8+ responsibilities) | `src/components/` | High |
| HandleAutocomplete + HandleChipInput ~90% shared | `src/components/` | Medium |
| Three independent avatar implementations | `src/components/` | Low |
| Card actions duplicated in StewardCard + ModalCardContent | `src/components/` | Low |

## 4. Type Consolidation Opportunities

| Redundant types | Location |
|-----------------|----------|
| `AccountStub`, `FollowedAccountCard`, `Actor` | 3 files, all represent "an AT Proto account" |
| Multiple endorsement representations | `EndorsementCounts`, `EndorsementResult`, `EndorsementMap` |

## 5. Recommended Refactoring Order

### Phase 1: Mechanical extractions (no logic changes) ← **current**
Extract shared constants and utility functions. Zero risk.

### Phase 2: Unified helpers (small logic consolidation)
- `isHumanReadableName(name, did)` — replaces 5 ad-hoc checks
- `bestUri(hostname, handle, did)` — replaces 3 fallback chains
- `landingPageFor(entry)` — replaces 3 copy-paste blocks
- `batchFetchProfiles()` — replaces 6 identical loops

### Phase 3: Component decomposition
- Decompose `GiveClient` into `useScanStream` hook + focused sub-components
- Extract shared `useTypeahead` hook from autocomplete components
- Create shared `CardActions` component

### Phase 4: Type unification
- Canonical `AccountIdentity` type replacing 3 ad-hoc types
- Unified tiering/priority system
