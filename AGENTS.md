<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# at.fund — Agent Guide

Quick-reference for AI agents working in this codebase. Full architecture docs
live in `docs/pipeline.md`; this file covers the guardrails and invariants you
must not break.

## What the app does

Helps ATProto users discover and fund the tools, feeds, and labelers they rely
on. Users sign in with Bluesky OAuth, the app scans their account relationships,
and renders funding cards for each discovered service.

## Architecture overview

```
Client (React 19)          Server (Next.js app router)
─────────────────          ────────────────────────────
Profile page               GET /api/stack/[handle]/stream (NDJSON)
  ProfileClient               resolveEntry() × N endorsed URIs
  ├── ProfileCard              resolveDependencies() (BFS)
  ├── StackStream          GET /api/lexicons/stream (NDJSON)
  │   └── StackEntriesList     scanStreaming() — 6-phase pipeline
  └── SetupClient (edit)

Give page
  GiveClient               GET /api/lexicons/stream (NDJSON)
  ├── StackEntriesList         scanStreaming() orchestrator
  └── HandleAutocomplete       6-phase pipeline:
                                 1. Gather accounts (follows, repo NSIDs, feeds, labelers)
                                 2. Collect network endorsements (single-pass over follows)
                                 3. Discover ecosystem entries (endorsement map lookup)
                                 4. Enrich (fund.at records, manual catalog, profiles)
                                 5. Attach capabilities (feeds, labelers, PDS)
                                 6. Resolve dependencies (breadth-first)
```

All phases receive a `ScanContext` — the single network orchestrator that owns
prefetch, caching, and concurrency. See `lib/scan-context.ts`.

## Critical invariants — do not break these

### ScanContext threading
Every pipeline phase and standalone resolver receives `ScanContext`. Never create
a second context within an existing scan. Never fetch fund.at records directly
when a context is available — always check `ctx.fundAtPrefetch` first.

### Module-level scan cache (`useScanStream`)
`hooks/useScanStream.ts` maintains a module-level `_scanCache` that survives
client-side navigation but clears on hard refresh. This is intentional — it
enables seamless tab switching without re-scanning. Do not move this to React
state or context (it must survive component unmounts). Currently only consumed
by `GiveClient.tsx`; do not add a second consumer without a guard.

### Streaming NDJSON contract
`/api/lexicons/stream` emits newline-delimited JSON events. The event types and
their order are documented in `docs/pipeline.md` (Event types section). Adding
new event types is fine; changing existing event shapes is a breaking change to
the client parser in `useScanStream`.

### Canonical types (DID-first)
- `Identity` — resolved presentation. `did` is required; `uri` always equals `did`. Handles and hostnames are display metadata only.
- `Funding` — how to contribute (source, contributeUrl, dependencies, channels, plans)
- `StewardEntry` — `Identity & Funding & { tags, capabilities }`
- `FundingChannel` / `FundingPlan` — payment channel and tier types from `lib/funding-manifest.ts`

All identity resolution goes through `buildIdentity()` in `steward-model.ts`.
All funding resolution goes through `resolveFunding()` / `resolveFundingForDep()`
in `funding.ts`. Do not create ad-hoc resolution logic. The manual catalog is
indexed by hostname (filename) with a DID reverse index — lookups by DID work
natively via `lookupManualStewardRecord()`.

### Lexicon NSIDs
New grouped NSIDs: `fund.at.actor.declaration`, `fund.at.funding.contribute`,
`fund.at.funding.channel`, `fund.at.funding.plan`, `fund.at.graph.dependency`,
`fund.at.graph.endorse`. Legacy flat NSIDs (`fund.at.contribute`,
`fund.at.dependency`, `fund.at.endorse`) are kept for migration reads only.
Always use the exported constants from `lib/fund-at-records.ts` — never
hardcode NSID strings. Read paths try new NSIDs first, fall back to legacy.
Writes always use new NSIDs.

### Auth flow
OAuth with ATProto DPoP. Session stored in an httpOnly DID cookie + Redis KV
(with in-memory fallback for local dev). Session validation happens on route
change, tab focus, and 401 response. The DPoP fetch patch in `lib/auth/client.ts`
works around a Next.js ReadableStream issue — do not modify without testing the
full OAuth flow.

**Cookie-based identity:** The `did` and `handle` cookies are both set at OAuth
callback time. The root layout reads them synchronously — no `getSession()` call,
no network I/O. This means every page render is instant regardless of session
state. `getSession()` is only called when the actual OAuth session object is
needed (e.g. `fetchOwnFundAtRecords` in the profile page's owner mode).

**Profile page session check:** The `/<identifier>` route uses `getSession()` to
validate the session before granting owner mode — the `did` cookie alone is not
enough (it can outlive an expired session). This runs in `Promise.all` alongside
other data fetches so it doesn't add latency. If the session is stale, the user
sees the public view.

**SessionContext handle resolution:** The session context includes `handle` in
addition to `did`. Both come from cookies set at login time — no client-side
fetch needed. This enables the "My Profile" nav link to point to `/<handle>`
immediately on first render.

### Centralized auth proxy
`src/proxy.ts` (Next.js 16 "proxy", formerly "middleware") checks the `did`
cookie before protected routes. Pages redirect to `/`; API routes get 401.
This is a lightweight guard — full session validation still happens in route
handlers via `getSession()`. Protected pages: `/give`, `/admin`. Protected
API routes: `/api/setup`, `/api/endorse`, `/api/lexicons`, `/api/admin`.
The `/<identifier>` profile page is **public** — owner mode is determined by
`getSession()` at render time, not by the proxy.

### Stack page (public)
`/stack/[handle]` is a public page showing a user's endorsed projects. It
streams entries via `/api/stack/[handle]/stream` (NDJSON, no auth required).
Uses `fetchPublicEndorsements()` which tries new then legacy endorse NSIDs.

### Migration route
`POST /api/migrate` converts legacy flat-namespace records to grouped NSIDs.
Protected by both the proxy and `getSession()`. Handles contribute, dependency,
and endorse records. Idempotent — safe to call multiple times.

## File organization

```
src/
├── proxy.ts          Centralized auth guard (Next.js 16 proxy convention)
├── app/
│   ├── [identifier]/ Unified profile page (public, viewer, owner modes)
│   ├── give/         Authenticated scan → discover fundable services
│   ├── setup/        Redirect → /<handle>?edit=true
│   ├── embed/        Embeddable funding card (self-contained, inline styles)
│   ├── lexicon/      Lexicon documentation
│   ├── dev/          API explorer
│   └── api/          API routes (stack/stream, entry, steward, endorse, setup, etc.)
├── components/       React client components ("use client")
│   ├── ProfileClient.tsx     Three-mode profile page (public/viewer/owner)
│   ├── GiveClient.tsx        Scan + discover + endorse page
│   ├── SetupClient.tsx       Funding config form (standalone or embedded in profile)
│   ├── StackStream.tsx       Streams endorsed entries via NDJSON
│   ├── StackEntriesList.tsx  Unified entry list (used everywhere)
│   ├── ProjectCards.tsx      StewardCard — single entry card
│   └── card-*.tsx            Card primitives, dependencies, utils
├── hooks/
│   ├── useScanStream.ts      Module-cached scan stream (for /give)
│   ├── useEndorsement.ts     Endorse/unendorse with optimistic updates
│   ├── useTypeahead.ts       Handle autocomplete
│   └── useDebounce.ts        Debounce helper
├── lib/              Server-side logic — no "use client" here
│   ├── pipeline/     6 scan phases + orchestrator + entry-resolve
│   ├── auth/         OAuth client, session, Redis KV store
│   └── *.ts          Shared utilities, types, resolution functions
├── data/             Static JSON catalogs (manual steward records, resolver overrides)
└── lexicons/         ATProto lexicon schemas
```

### Key component patterns

**StackEntriesList** is the single list component used by all entry lists
(GiveClient, StackStream, profile card deps). It wraps `StewardCard` in
`CardErrorBoundary` and accepts optional endorsement props (`endorsedSet`,
`onEndorse`, `onUnendorse`, `endorsementCounts`).

**useEndorsement** provides optimistic endorse/unendorse with rollback.
Used by ProfileClient for the profile page and available for any context
that needs endorsement state. GiveClient has its own inline version with
additional `endorseAndFetch` logic for the scan workflow.

**SetupClient** supports two modes: standalone (full page with preview) and
embedded (`embedded` prop — form only, emits changes via `onFormChange` for
live preview in parent, accepts `onCancel` for dismiss).

### Conventions
- Server-only code: `src/lib/` — never import from `src/components/` or `src/hooks/`
- Client components: always start with `"use client"` directive
- Path alias: `@/` maps to `src/`
- Constants: `lib/constants.ts` — PUBLIC_API, PROFILE_BATCH, FEED_BATCH
- Types: `lib/steward-model.ts` — canonical Identity, Funding, StewardEntry
- Pure helpers: `buildIdentity()`, `isHumanReadableName()`, `entryPriority()` — safe for client import

## Testing

Tests use **Vitest** with `globals: true` (no explicit imports needed for
describe/it/expect). Test files are co-located: `foo.test.ts` next to `foo.ts`.

```bash
pnpm test            # single run
pnpm test:watch      # watch mode
pnpm test:coverage   # run with v8 coverage report
```

### Testing patterns
- Mock modules with `vi.mock()` — see `lexicon-scan.test.ts` for comprehensive example
- Mock timers with `vi.useFakeTimers()` — see `xrpc-cache.test.ts`
- Use `vi.fn()` for function mocks, `vi.spyOn()` for method spies
- Always `vi.resetAllMocks()` / `vi.restoreAllMocks()` in `beforeEach`
- Test edge cases: empty input, null/undefined, error paths

### What must be tested
- Any new resolution or transformation logic in `lib/`
- Validation functions
- Changes to the funding or identity resolution chain
- Changes to entry priority / merge logic

## Quality checks — required before completing any task

Run all three checks and fix any errors or warnings before considering
work complete. Do not leave lint warnings for the next person.

```bash
pnpm exec tsc --noEmit    # type check — must be clean
pnpm lint                 # eslint — zero errors AND zero warnings
pnpm test                 # vitest — all tests must pass
```

If `pnpm build` fails due to network issues (e.g. Google Fonts), the
TypeScript check (`tsc --noEmit`) is an acceptable substitute for
verifying compilation. But always run all three checks above.

## Common pitfalls

1. **Don't mutate ScanContext** — it's `readonly` by design. Thread it through; don't clone or recreate.
2. **Don't add "use client" to lib/ files** — they run server-side only.
3. **Don't import server modules from components** — they'll break the client bundle.
4. **Catalog entries require a `did` field** — all other fields are optional. The DID reverse index relies on this.
5. **URI normalization matters** — always use `normalizeStewardUri()` from `steward-uri.ts` for user input.
6. **DID is the dedup key** — `EntryIndex` merges entries by DID. Two entries with different URIs but the same DID will merge.
7. **fund.at records win over manual catalog** — but manual contributeUrl is used as fallback when fund.at has none.
8. **The endorsement cap is 2500 follows** — by design, to prevent O(n^2) scans.
9. **Don't use `resolveEntry()` in server components** — it runs a 4-phase sequential pipeline (identity → funding → capabilities → dependencies) that blocks page render. For pages, fetch data in parallel with `batchFetchProfiles` + `fetchFundAtRecords` + `fetchPublicEndorsements` and assemble with `buildIdentity()`. Let StackStream handle the heavy resolution client-side.
10. **Don't check `did` cookie for owner mode** — use `getSession()` to validate the session. The cookie can outlive an expired OAuth session. Always validate server-side.
11. **Don't create bespoke entry lists** — use `StackEntriesList` with optional endorsement props. Don't inline `<ul>` + `CardErrorBoundary` + `StewardCard` patterns.

## Docs reference

| Document | What it covers |
|----------|---------------|
| `docs/pipeline.md` | Full 6-phase pipeline, event types, rendering rules, file map |
| `docs/fund-at-funding-spec.md` | Lexicon specification: channels, plans, grouped NSIDs, cents convention |
| `docs/funding-json-integration.md` | funding.json as optional enrichment layer for funding data |
| `docs/contribution-strategy-todo.md` | Open issues: complexity, test coverage, invariant concerns |
| `docs/architecture-review.md` | Completed refactoring history and canonical type system |
| `docs/architecture-best-practices.md` | Ongoing improvement tracking (this round) |
| `docs/atfund-discovery.md` | DNS/HTTPS resolution, record scoping, future acknowledgement signals |
| `docs/atproto-oauth-scopes.md` | OAuth scope quirks, PDS mismatch workaround, SDK patterns |
| `docs/catalog-review-process.md` | Manual catalog entry criteria, discovery sources, validation |
| `docs/jetstream-endorsement-collector.md` | Future: real-time endorsement indexer (concept stage) |
