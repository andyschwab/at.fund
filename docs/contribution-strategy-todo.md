# Contribution Strategy — Open Issues

Tracked issues from the audit of the channel/plan lexicon restructure
(`claude/at-fund-contribution-strategy-f36TD`).

## Complexity

### SetupClient.tsx (~725 lines)
Form state, preview rendering, validation, dependency resolution, and migration
logic all live in one component. Consider extracting:
- Form row management into a `useFundingRows` hook
- Preview rendering into a `FundingPreview` sub-component
- Dependency chip management (already partially extracted via `HandleChipInput`)

### fund-at-records.ts (~450 lines)
Handles identity resolution, DID doc caching, channel/plan parsing, dual
auth paths (public vs authenticated), and legacy NSID fallback. The DID doc
cache is global state that could be part of `ScanContext.fundAtPrefetch`.

### GiveClient.tsx (~550 lines)
8 derived states, 4 memoized arrays, 3 callbacks. The entry lookup pattern
appears 4x — could extract an `entryLookup()` helper.

## Invariant / Correctness

### Plan-to-channel matching overwrites
Both `SetupClient.tsx:118-128` and `card-primitives.tsx:272-278` build a
`planByChannel` map where multiple plans referencing the same channel silently
overwrite each other. Currently acceptable because the UI enforces 1:1, but
this will break if plans can reference multiple channels in the future.

### Seq counter collision risk
`SetupClient.tsx` derives `nextSeq` from existing records on load. If records
are deleted externally (e.g. via PDS tooling), new records could collide with
old rkeys. Consider using TID-based keys instead of sequential counters.

### deriveChannelType always returns 'payment-provider'
`SetupClient.tsx:80-83` — the function has a conditional that always returns
the same value. Either expand the logic or simplify to a constant.

## Test Coverage

Current: 164 tests, ~27% coverage of new code. Priority gaps:

### Critical (no coverage)
- **Cents/dollars round-trip**: Write `Math.round(amount * 100)` →
  read `amount / 100`. No test verifies the cycle. Floating-point edge cases
  like `19.99 * 100 = 1998.9999...` are unprotected.
- **deleteWithFallback**: Tries new NSID, falls back to legacy. Untested.
- **Entry merge with channels/plans**: `steward-merge.ts` preserves
  `channels` and `plans` via `preferred ?? other`, but no test verifies this.
- **Endorsed URI normalization**: The re-emit flow in `scan-stream.ts` that
  expands endorsed URIs with resolved identifiers has no test.

### High (no coverage)
- **API routes**: Zero tests for `/api/setup`, `/api/endorse`, `/api/migrate`.
  Payload parsing, validation, cents conversion, and delete logic are all
  untested.
- **SetupClient form state**: `initialFormState` merging of existing
  channels/plans, seq counter management, and submit payload construction.
- **isEndorsed matching**: All three branches (uri, did, handle) untested.

### Medium (partial coverage)
- `parseChannelRecord` / `parsePlanRecord` — tested indirectly via
  `funding-manifest.test.ts` but not the ATProto record variants.
- Platform detection (`detectPlatform`) — tested, but slug/label derivation
  in `SetupClient` (`baseSlugFromUri`, `baseLabelFromUri`) is not.

## Architecture Notes

### Duplicate plan-to-channel slug extraction
AT URI rkey extraction (`split('/').pop()!`) appears in:
- `SetupClient.tsx:124`
- `card-primitives.tsx:276`
- `fund-at-records.ts` (various record parsing)

Could extract a shared `extractRkey(atUri: string): string` helper, but the
duplication is minor (one-liners in different contexts).

### Legacy lexicon lifecycle
Old-style NSIDs (`fund.at.contribute`, `fund.at.dependency`, `fund.at.endorse`)
are kept for migration reads. Once all user records are migrated, these can be
removed along with:
- `src/lexicons/fund/at/contribute*`
- `src/lexicons/fund/at/dependency*`
- `src/lexicons/fund/at/endorse*`
- `LEGACY_*` constants in `fund-at-records.ts`
- Fallback read paths in `fetchFundAtRecords` / `fetchOwnFundAtRecords`
- The `/api/migrate` route
- `deleteWithFallback` (can become direct deletes)

### Spec document (`docs/fund-at-funding-spec.md`)
The spec only documents new-style NSIDs. It should note:
- That old-style NSIDs exist for backwards compatibility
- The `fund.at.manifest` record has been removed (never deployed)
- The cents convention applies everywhere amounts appear
