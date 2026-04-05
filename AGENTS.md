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
useScanStream hook    ←──  GET /api/lexicons/stream (NDJSON)
  ↓                           ↓
EntryIndex (dedup)         scanStreaming() orchestrator
  ↓                           ↓
GiveClient + cards         6-phase pipeline:
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

### Canonical types
- `Identity` — resolved presentation (uri, did, handle, displayName, avatar, landingPage)
- `Funding` — how to contribute (source, contributeUrl, dependencies)
- `StewardEntry` — `Identity & Funding & { tags, capabilities }`

All identity resolution goes through `buildIdentity()` in `steward-model.ts`.
All funding resolution goes through `resolveFunding()` / `resolveFundingForDep()`
in `funding.ts`. Do not create ad-hoc resolution logic.

### Auth flow
OAuth with ATProto DPoP. Session stored in an httpOnly DID cookie + Redis KV
(with in-memory fallback for local dev). Session validation happens on route
change, tab focus, and 401 response. The DPoP fetch patch in `lib/auth/client.ts`
works around a Next.js ReadableStream issue — do not modify without testing the
full OAuth flow.

## File organization

```
src/
├── app/              Pages + API routes (Next.js app router)
├── components/       React client components ("use client")
├── hooks/            Custom React hooks (useScanStream, useTypeahead, useDebounce)
├── lib/              Server-side logic — no "use client" here
│   ├── pipeline/     6 scan phases + orchestrator + entry-resolve
│   ├── auth/         OAuth client, session, Redis KV store
│   └── *.ts          Shared utilities, types, resolution functions
├── data/             Static JSON catalogs (manual steward records, resolver overrides)
└── lexicons/         ATProto lexicon schemas
```

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
pnpm test          # single run
pnpm test:watch    # watch mode
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

## Common pitfalls

1. **Don't mutate ScanContext** — it's `readonly` by design. Thread it through; don't clone or recreate.
2. **Don't add "use client" to lib/ files** — they run server-side only.
3. **Don't import server modules from components** — they'll break the client bundle.
4. **Catalog entries require `displayName`** — all other fields are optional.
5. **URI normalization matters** — always use `normalizeStewardUri()` from `steward-uri.ts` for user input.
6. **DID is the dedup key** — `EntryIndex` merges entries by DID. Two entries with different URIs but the same DID will merge.
7. **fund.at records win over manual catalog** — but manual contributeUrl is used as fallback when fund.at has none.
8. **The endorsement cap is 2500 follows** — by design, to prevent O(n^2) scans.

## Docs reference

| Document | What it covers |
|----------|---------------|
| `docs/pipeline.md` | Full 6-phase pipeline, event types, rendering rules, file map |
| `docs/architecture-review.md` | Completed refactoring history and canonical type system |
| `docs/architecture-best-practices.md` | Ongoing improvement tracking (this round) |
| `docs/atfund-discovery.md` | DNS/HTTPS resolution, record scoping, future acknowledgement signals |
| `docs/atproto-oauth-scopes.md` | OAuth scope quirks, PDS mismatch workaround, SDK patterns |
| `docs/catalog-review-process.md` | Manual catalog entry criteria, discovery sources, validation |
| `docs/jetstream-endorsement-collector.md` | Future: real-time endorsement indexer (concept stage) |
