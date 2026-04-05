# Architecture Best Practices

_Last updated: 2026-04-05_

Continuous improvement tracking. Builds on the refactoring work in
[architecture-review.md](./architecture-review.md) with a focus on proactive
quality — making sure the codebase stays clean as it evolves.

---

## Phase 1 — High Priority (protect existing quality)

| # | Action | Status |
|---|--------|--------|
| 1 | Expand AGENTS.md with architectural guardrails | **done** |
| 2 | Add CI pipeline (lint, typecheck, test, build) | **done** |
| 3 | Add unit tests for `funding.ts` and `identity.ts` (core business logic) | **done** |
| 4 | Add unit tests for `validate.ts` (input validation, zero coverage) | **done** |
| 5 | Add error handling strategy to `pipeline.md` | **done** |

## Phase 2 — Medium Priority (reduce duplication, improve resilience)

| # | Action | Status |
|---|--------|--------|
| 6 | Extract `LoginForm` component (duplicated in NavBar, RequireSession, LandingPage) | pending |
| 7 | Extract `FundActionButtons` component (5+ duplicate button groups) | pending |
| 8 | Add React error boundaries for card rendering | pending |
| 9 | Add pipeline phase tests (7 phases, ~1200 LOC, zero tests) | pending |
| 10 | Automate catalog JSON validation in CI | pending |

## Phase 3 — Lower Priority (future-proofing)

| # | Action | Status |
|---|--------|--------|
| 11 | Add Next.js middleware for centralized auth | pending |
| 12 | Add E2E tests (Playwright) | pending |
| 13 | Configure test coverage reporting (vitest --coverage) | pending |
| 14 | Extract shared input style constants (repeated ~270-char Tailwind strings) | pending |
| 15 | Document cache invalidation strategy for module-level client cache | pending |

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

### Architecture risks

- **AGENTS.md is 5 lines** — AI agents have no context about pipeline invariants,
  the module-level cache, ScanContext coordination, or auth flow
- **11% test coverage** (9 of ~84 lib files) — core business logic untested
- **No CI pipeline** — regressions land silently
- **DPoP fetch patch** could break on Next.js upgrades (fragile workaround)
- **3-min scan timeout** on Vercel — no documented graceful degradation
- **No React error boundaries** — a card rendering error crashes the whole page
- **Login form duplicated** in 3 components
- **Fund/Endorse buttons** duplicated in 5+ locations

### Documentation gaps

- No error handling strategy for pipeline phase failures
- No testing strategy or coverage targets
- No cache invalidation documentation for client-side module cache
- Catalog validation is manual (Python one-liners)
