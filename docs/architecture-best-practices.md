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
| 6 | Extract `LoginForm` component (duplicated in NavBar + RequireSession) | **done** |
| 7 | ~~Extract `FundActionButtons` component~~ | **dropped** — only 2 true duplicates, abstraction overhead not justified |
| 8 | Add React error boundaries for card rendering | **done** |
| 9 | Add pipeline phase tests (dep-resolve) | **done** |
| 10 | Automate catalog JSON validation in test suite | **done** |

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

- ~~AGENTS.md is 5 lines~~ — **fixed**: expanded with invariants, conventions, pitfalls
- ~~11% test coverage~~ — **improved**: core business logic (funding, identity, validate, entry-priority) now tested
- ~~No CI pipeline~~ — **fixed**: GitHub Actions (lint, typecheck, test, build)
- ~~No error handling docs~~ — **fixed**: strategy added to pipeline.md
- ~~Lint issues (1 error, 9 warnings)~~ — **fixed**: all resolved
- **DPoP fetch patch** could break on Next.js upgrades (fragile workaround)
- **No React error boundaries** — a card rendering error crashes the whole page
- **Login form duplicated** in NavBar + RequireSession (~60 lines shared markup)

### Documentation gaps

- No testing strategy or coverage targets
- No cache invalidation documentation for client-side module cache
- Catalog validation is manual (Python one-liners)
