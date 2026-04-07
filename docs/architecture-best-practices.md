# Architecture Best Practices

_Last updated: 2026-04-06_

Continuous improvement tracking. Builds on the refactoring work in
[architecture-review.md](./architecture-review.md) with a focus on proactive
quality — making sure the codebase stays clean as it evolves.

---

## Phase 1 — High Priority (protect existing quality) ✓

| # | Action | Status |
|---|--------|--------|
| 1 | Expand AGENTS.md with architectural guardrails | **done** |
| 2 | Add CI pipeline (lint, typecheck, test, build) | **done** |
| 3 | Add unit tests for `funding.ts` and `identity.ts` (core business logic) | **done** |
| 4 | Add unit tests for `validate.ts` (input validation, zero coverage) | **done** |
| 5 | Add error handling strategy to `pipeline.md` | **done** |

## Phase 2 — Medium Priority (reduce duplication, improve resilience) ✓

| # | Action | Status |
|---|--------|--------|
| 6 | Extract `LoginForm` component (duplicated in NavBar + RequireSession) | **done** |
| 7 | ~~Extract `FundActionButtons` component~~ | **dropped** — only 2 true duplicates, abstraction overhead not justified |
| 8 | Add React error boundaries for card rendering | **done** |
| 9 | Add pipeline phase tests (dep-resolve) | **done** |
| 10 | Automate catalog JSON validation in test suite | **done** |
| — | Decouple all tests from admin-managed catalog data | **done** |

## Phase 3 — Lower Priority (future-proofing) ✓

| # | Action | Status |
|---|--------|--------|
| 11 | Add Next.js proxy for centralized auth | **done** — `src/proxy.ts` guards pages + API routes via `did` cookie |
| 12 | Add E2E tests (Playwright) | **deferred** — planning doc at `docs/e2e-testing-plan.md` |
| 13 | Configure test coverage reporting (vitest --coverage) | **done** — v8 provider, `pnpm test:coverage` (baseline: 34% statements) |
| 14 | ~~Extract shared input style constants~~ | **dropped** — only ~8 medium-length patterns (160–200 chars), not the ~270-char duplication originally estimated; extraction overhead not justified |
| 15 | ~~Document cache invalidation strategy~~ | **dropped** — `_scanCache` lifecycle is self-evident from code comments; a docstring suffices, not a full doc |

## Phase 4 — Profile page unification ✓

| # | Action | Status |
|---|--------|--------|
| 16 | Unified profile page at `/<identifier>` with three viewer modes | **done** |
| 17 | Parallel server-side data fetching (replace sequential `resolveEntry()`) | **done** |
| 18 | Session validation for owner mode (not just cookie check) | **done** |
| 19 | Unified `StackEntriesList` component for all entry lists | **done** |
| 20 | Shared `useEndorsement` hook with optimistic updates | **done** |
| 21 | Inline edit with live card preview (`SetupClient` embedded mode) | **done** |
| 22 | Wire endorsement through all views (deps modal, endorsed list, profile card) | **done** |
| 23 | Endorse-by-handle on profile page | **done** |
| 24 | Remove `/stack` page (absorbed into profile) | **done** |
| 25 | Convert `/setup` to redirect to profile with `?edit=true` | **done** |
| 26 | Add `handle` to SessionContext for profile nav link | **done** |
| 27 | Update NavBar (remove "Receive", add conditional "My Profile") | **done** |

---

## Observations

### What's working well

- **6-phase pipeline** with clear boundaries and ScanContext threading
- **Streaming-first UX** via NDJSON — progressive rendering, no polling
- **Canonical type system** (Identity, Funding, StewardEntry) eliminates ad-hoc types
- **Speculative prefetch** turns sequential fund.at lookups into cache hits
- **Module-level scan cache** enables seamless client-side navigation
- **Strict TypeScript** throughout; path aliases for clean imports
- **No TODOs/FIXMEs** in the codebase — refactoring work is complete
- **CI pipeline** catches lint, type, test, and build regressions on every PR
- **164 unit tests** covering core business logic, pipeline phases, and catalog validation
- **Admin-editable data** (`src/data/`) fully decoupled from test assertions
- **Error boundaries** isolate card rendering failures from the rest of the page
- **Shared LoginForm** eliminates the NavBar/RequireSession duplication
- **Unified profile page** (`/<identifier>`) with three viewer modes (public, authenticated, owner)
- **Single list component** (`StackEntriesList`) used by GiveClient, StackStream, and profile deps
- **Shared endorsement hook** (`useEndorsement`) with optimistic updates and rollback
- **Parallel server-side data fetching** on profile page (no sequential pipeline)
- **Live edit preview** — SetupClient embedded in profile card with real-time form→card updates

### Remaining architecture risks

- **DPoP fetch patch** could break on Next.js upgrades (fragile workaround)
- **No E2E tests** — unit tests cover logic but not user flows (see `docs/e2e-testing-plan.md`)
- ~~No centralized auth~~ — **fixed**: `src/proxy.ts` guards pages + API routes
- ~~No coverage visibility~~ — **fixed**: `pnpm test:coverage` reports v8 coverage
- **Viewer endorsement state** — on other users' profiles, the viewer's own endorsement state isn't loaded (would need a separate fetch of the viewer's endorsements)

### Admin data vs constants

All files in `src/data/` are admin-managed data (catalog entries, resolver
overrides, admin handles). Tests validate **structure and behavior**, not
specific entries. You can freely add, remove, or edit entries without changing
any test file:

- `src/data/catalog/*.json` — validated structurally by `data/catalog.test.ts`
- `src/data/resolver-catalog.json` — validated structurally; every override is
  tested dynamically in `lib/catalog.test.ts`
- `src/data/admins.json` — consumed by `lib/admins.ts`, no entry-specific tests
- `src/lib/lexicon-scan.test.ts` — mocks the catalog module with synthetic
  fixtures so pipeline tests don't break when catalog data changes
