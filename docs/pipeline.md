# Scan pipeline

End-to-end flow from user sign-in to rendered account cards.

## Overview

The app answers one question: **what ATProto tools, feeds, and labelers has this user actually used, and how can they support those projects?**

Everything is account-centric. A card represents an **ATProto account** (identified by DID), and feeds, labelers, and tools are **capabilities** that account provides. The only entity type that gets a distinct visual treatment is a **tool** — an NSID-linked service with a lexicon. Everything else (follows, feed publishers, labelers) renders as a standard blue account card.

### Two entry paths

| Path | Trigger | Implementation |
|------|---------|----------------|
| **Full scan** | Sign-in, refresh | `scanStreaming()` — 6-phase pipeline, streams all entries |
| **Single entry** | Endorse-add, dep modal | `resolveEntry()` — full vertical for one URI |

Both produce the same `StewardEntry` shape. The full scan discovers accounts from the user's relationships; the single-entry path resolves one URI on demand.

### Pipeline phases

```
Phase 1: GATHER         Discover every account the user has a relationship with
Phase 2: ENDORSEMENTS   Collect network endorsements (single-pass over all follows)
Phase 3: ECOSYSTEM      Discover entries endorsed by the user's network
Phase 4: ENRICH         Resolve funding info (fund.at, manual catalog, profiles)
Phase 5: CAPABILITIES   Attach feed/labeler details to enriched accounts
Phase 6: DEPENDENCIES   Resolve referenced entries for drill-down
```

## Phase 1: Gather accounts

**File:** `src/lib/pipeline/account-gather.ts`

Collects every DID the user has a relationship with. No fund.at lookups — just discovery.

### Sources

| Source | How | Tag assigned |
|--------|-----|-------------|
| Repo collections | NSIDs + `createdWith` + `$type` → resolver catalog → steward URI → DNS → DID | `tool` |
| Follows | `app.bsky.graph.getFollows` (paginated, ALL follows) | `follow` |
| Feed subscriptions | `getPreferences` → saved feed URIs → extract creator DID | *(none — held for Phase 5)* |
| Labeler subscriptions | `getPreferences` → labeler DIDs | *(none — held for Phase 5)* |
| Self-reported | User-provided handles/DIDs from "Endorse" input | `tool` |

Feed and labeler DIDs are registered with `ensureAccount()` — this reserves the DID slot in the accounts map **without assigning a tag**. Tags for these are derived from confirmed capability data in Phase 5. This prevents feeds from appearing as standalone cards before we know they're real capabilities.

### Output

```typescript
type GatherResult = {
  did: string
  handle?: string
  pdsUrl?: string
  accounts: Map<string, GatheredAccount>   // DID → stub with tags + hostnames
  warnings: ScanWarning[]
  feedUris: string[]                       // AT URIs for Phase 5
  labelerDids: string[]                    // DIDs for Phase 5
  ctx: ScanContext                         // shared network context (prefetch map)
}
```

A `GatheredAccount` accumulates tags from multiple sources. If the same DID appears as a tool AND a follow AND a feed creator, it gets all three tags on one stub.

### Speculative prefetch

As Phase 1 discovers DIDs, it fires fund.at record prefetches via `ctx.prefetch(did)`. These run with bounded concurrency (20 parallel) in the background while gather continues. By the time Phase 4 (enrich) needs funding data, most prefetch promises have already resolved. See `lib/fund-at-prefetch.ts` and `lib/scan-context.ts`.

### Steward URI resolution

Observed keys (NSIDs, URLs, `$type` values) pass through `resolveStewardUri()` from `src/lib/catalog.ts`:

1. Check `resolver-catalog.json` overrides (longest prefix match)
2. If starts with `did:` → return as-is
3. If contains `://` → extract hostname
4. If 3+ dot segments → NSID; infer hostname from first two segments
5. If 1-2 dot segments → already a hostname; normalize and return

## Phase 2: Collect network endorsements

**Files:** `src/lib/microcosm.ts`, `src/lib/pipeline/scan-stream.ts`

Single-pass collection of all endorsements made by the user's follows. O(follows): one Slingshot `resolveMiniDoc` (to find each follow's PDS) + one PDS `listRecords` (to fetch their `fund.at.endorse` records).

### How it works

1. For each follow DID, resolve their PDS URL via Slingshot's `blue.microcosm.identity.resolveMiniDoc`
2. Query each PDS directly with `com.atproto.repo.listRecords` for the `fund.at.endorse` collection
3. Build an `EndorsementMap`: `Map<endorsedURI, Set<endorserDID>>`

Results are cached in Redis (with in-memory fallback) keyed by a lightweight fingerprint of the follow DID list.

### Output

```typescript
type EndorsementMap = Map<string, Set<string>>
// endorsed URI → Set of endorser DIDs
```

## Phase 3: Ecosystem discovery

**File:** `src/lib/pipeline/ecosystem-scan.ts`

Fast in-memory lookup against the endorsement map. Discovers two kinds of entries:

1. **Curated catalog entries** tagged `ecosystem` (always shown)
2. **Network-discovered URIs** endorsed by 1+ follows (from endorsement map)

Ecosystem URIs are injected into the gathered accounts (with tag `ecosystem`) so they flow through enrichment alongside everything else.

## Phase 4: Enrich accounts

**File:** `src/lib/pipeline/account-enrich.ts`

For each account, resolves identity and funding info. DID is the canonical key throughout — the catalog's DID reverse index means lookups work natively by DID.

### Resolution order

For each `GatheredAccount`:

1. **Batch profile resolution** — `app.bsky.actor.getProfiles` for all DIDs (batches of 25). Returns handle, displayName, description, avatar.
2. **fund.at records** — `fetchFundAtForStewardDid(did)` from the steward's PDS
3. **Manual catalog by DID** — `lookupManualStewardRecord(did)` uses the DID reverse index to find hostname-keyed entries
4. **Fallback** — `source: 'unknown'`

When both fund.at and manual catalog exist, fund.at wins for `contributeUrl` (manual is fallback) and dependencies are unioned.

### URI and displayName selection

- `uri`: always the DID (DID-first canonical key)
- `displayName`: profile name preferred (if human-readable), then handle, then DID

### Emission

All entries with at least one tag are emitted as `entry` events, including ecosystem entries. The client's `EntryIndex` handles dedup.

### Output

One `StewardEntry` per account.

## Phase 5: Attach capabilities

**File:** `src/lib/pipeline/capability-scan.ts`

Fetches display info for feeds and labelers, then attaches them as `Capability` objects on the account's entry. Also adds `feed`/`labeler` tags and re-emits entries so the client receives updated cards.

### Feeds

`app.bsky.feed.getFeedGenerators(feedUris)` returns per-feed info (batched, max 25 per request):
- `displayName` — the feed's name (e.g., "Discover")
- `creator.did` — matched to an existing entry
- `uri` — AT URI, parsed for rkey
- `landingPage` — constructed as `https://bsky.app/profile/{handle}/feed/{rkey}`

Multiple feeds by the same creator become multiple capabilities on one card. Phase 5 also back-fills handle, displayName, and landingPage onto entries from API responses if the Phase 4 profile fetch returned incomplete data.

### Labelers

`app.bsky.labeler.getServices(dids)` returns labeler info:
- `creator.displayName` — the labeler name
- `landingPage` — Bluesky profile link

### Capability type

```typescript
type Capability = {
  type: 'feed' | 'labeler' | 'pds'
  name: string
  description?: string
  uri?: string        // AT URI for feeds/labelers
  landingPage?: string
  hostname?: string   // for type 'pds': the entryway domain (e.g. 'bsky.social')
}
```

## Phase 6: Resolve dependencies

**File:** `src/lib/pipeline/dep-resolve.ts`

For entries with `dependencies[]`, resolves each dependency URI via fund.at records and the manual catalog. Resolution is multi-level (breadth-first queue) so nested dependency chains are fully resolved. Resolved deps are emitted as `entry` events and merge into the unified `EntryIndex`.

## Orchestration

**File:** `src/lib/pipeline/scan-stream.ts`

`scanStreaming()` creates a `ScanContext` and threads it through all phases. The context owns the speculative fund.at prefetch map (see Phase 1) and is the single place to manage network-level concerns like caching, concurrency, and rate limiting.

It runs all phases and emits `ScanStreamEvent` objects for the client to consume progressively:

1. Endorsements → `endorsed` event with the user's own endorsed URIs
2. Phase 1 → `status` events during discovery, `meta` event with user info, `warning` events
3. Phase 2–3 → `status` events during endorsement collection and ecosystem discovery
4. Phase 4 → `entry` events as each account is enriched (all entries with tags)
5. Phase 5 → updated `entry` events with capabilities attached (first emission for feed/labeler-only accounts)
6. Phase 6 → `entry` events for dependency entries
7. `endorsement-counts` → per-entry network endorsement counts
8. PDS host → `entry` event with `tags: ['tool', 'pds-host']` and a `pds` capability for the entryway
9. `done` event

### Event types

```typescript
type ScanStreamEvent =
  | { type: 'meta'; did: string; handle?: string; pdsUrl?: string }
  | { type: 'status'; message: string }
  | { type: 'endorsed'; uris: string[] }
  | { type: 'entry'; entry: StewardEntry }
  | { type: 'endorsement-counts'; counts: Record<string, EndorsementCounts> }
  | { type: 'warning'; warning: ScanWarning }
  | { type: 'done' }
```

### Client-side merging

The client (`GiveClient.tsx`) uses a single `EntryIndex` from `steward-merge.ts` to deduplicate all entries by DID as they stream in. Primary entries, dependency entries, and ecosystem entries all flow through the same index. When later phases re-emit entries (e.g., with capabilities or profile data), the merge unions tags, dependencies, and capabilities correctly.

Lookup maps in `ProjectCards.tsx` and `card-dependencies.tsx` key by `uri`, `did`, and `handle` so dependencies can be found regardless of which identifier form is used.

## Single-entry resolution

**File:** `src/lib/pipeline/entry-resolve.ts`
**Endpoint:** `GET /api/entry?uri=<handle-or-did-or-hostname>`

Runs the full pipeline vertically for a single entity. Used for:
- **Endorse-add** — user endorses an account by handle; we fetch full data without rescanning
- **Dependency modal** — drilling into a dependency loads its complete entry

### Stages

```
Input: handle, DID, or hostname
  │
  ▼
1. RESOLVE IDENTITY
   • handle → resolveHandle → DID
   • hostname → DNS _atproto → DID
   • Fetch profile: avatar, displayName, description, handle
  │
  ▼
2. FUNDING & CATALOG
   • fetchFundAtForStewardDid(did) → contributeUrl, dependencies
   • lookupManualStewardRecord → contributeUrl, deps
   • Merge: fund.at wins, union deps
  │
  ▼
3. CAPABILITIES
   • listRecords(app.bsky.feed.generator) → discover ALL feeds the DID publishes
   • getFeedGenerators(uris) → feed display names, descriptions, landing pages
   • getServices([did]) → labeler status
   • Attach as Capability[], add feed/labeler tags
  │
  ▼
4. DEPENDENCIES
   • resolveDependencies([entry]) → referenced entries (multi-level)
  │
  ▼
Output: { entry: StewardEntry, referenced: StewardEntry[] }
```

Stage 3 discovers capabilities by listing the DID's own repo for feed generator records, rather than relying on the user's subscription list. This finds *all* feeds the account publishes.

## Rendering

### Card types

There are two card types, determined by the `cardType()` function:

| Type | Condition | Style | Title links to |
|------|-----------|-------|----------------|
| `tool` | Has `tool` tag | Warm left border, support accent | Website/hostname |
| `account` | Everything else | Blue left border, network accent | Bluesky profile |
| `discover` | `source === 'unknown'`, no capabilities | Amber dashed border | Website |

Only the `tool` tag affects card type. Feeds, labelers, and follows all render as blue account cards — their feeds/labelers appear in the "Provides" capabilities section.

### Component structure

```
card-primitives.tsx     Stateless building blocks
  ├── ProfileAvatar         Avatar image with initials fallback
  ├── StewardNameHeading    Linked title with variant-colored hover
  ├── HandleBadge           @handle linking to DID profile
  ├── TagBadges             Inline tag pills (tool, feed, labeler, follow, ecosystem, personal data server)
  ├── CapabilitiesSection   "Provides" list of feeds, labelers, and PDS capabilities
  └── helpers               heartState, websiteFallbackForUri, profileUrlFor

card-dependencies.tsx   Drill-down modal system
  ├── DependencyRow         Clickable row with avatar + droplet badge
  ├── ModalCardContent      Compact modal layout with Fund/Endorse action buttons
  └── DependenciesSection   Sorted dep rows + dialog modal

ProjectCards.tsx        Card exports
  └── StewardCard           Compact <li> row: avatar, name, tags, Fund/Endorse buttons,
                            network endorsement count, capabilities section, dependencies section
```

### Card anatomy

```
[Avatar]  Title  @handle  tag  tag     [Fund] [Endorse]
          Description text
          N endorsement(s) from your network
          ┌ Provides ──────────────────────┐
          │ 📰 Feed Name                   │
          │ 🏷️ Labeler Name               │
          │ 🖥️ Personal Data Server  host  │
          └────────────────────────────────┘
          ┌ Depends on ────────────┐
          │ [avatar] dep-name    → │
          └────────────────────────┘
```

### Page layout

The give page has three sections:

1. **My Stack** — pinned at top. Contains PDS host entry and all entries the user has endorsed. Endorsements are `fund.at.endorse` records — public, protocol-level signals of trust. The hover state on endorsed buttons swaps to "Remove" with a red color shift.

2. **My Fundable Services** tab — tools, feeds, labelers, and follows (with contribute URLs) discovered from the user's account data. Excludes ecosystem-only entries and PDS host (pinned above). Filter pills (Tools, Feeds, Labelers, Network) filter by tag.

3. **Endorsed by My Network** tab — entries with the `ecosystem` tag that aren't already in the discover list. Sorted by network endorsement count. These are projects endorsed by people the user follows but not already surfaced in their own fundable services.

### Visibility rules

- Tools, labelers, feeds: always visible
- Follows: only visible if they have a `contributeUrl`
- Ecosystem-only: visible in the "Endorsed by My Network" tab
- PDS host: always pinned in My Stack

## File map

```
src/
├── app/
│   ├── page.tsx                          Landing page
│   ├── give/page.tsx                     Give page (requires auth)
│   ├── setup/page.tsx                    Publish fund.at records
│   └── api/
│       ├── entry/route.ts                Full single-entry resolution
│       ├── endorse/route.ts              Endorsement create/delete
│       ├── setup/route.ts                Publish/delete fund.at records
│       ├── lexicons/
│       │   ├── route.ts                  Non-streaming JSON scan (legacy)
│       │   └── stream/route.ts           Streaming API → scanStreaming()
│       └── steward/route.ts              Thin steward lookup (legacy)
├── components/
│   ├── GiveClient.tsx                    Client: streaming scan, unified EntryIndex, tabs, endorsement
│   ├── SetupClient.tsx                   Setup form: contribute URL, dependencies, live preview
│   ├── ProjectCards.tsx                  StewardCard (compact <li> row)
│   ├── card-primitives.tsx               ProfileAvatar, TagBadges, CapabilitiesSection, etc.
│   ├── card-dependencies.tsx             DependencyRow, ModalCardContent, DependenciesSection
│   ├── HandleAutocomplete.tsx            Bluesky handle typeahead search
│   ├── HandleChipInput.tsx               Chip-based multi-value input for dependencies
│   ├── SuggestionList.tsx                Shared typeahead dropdown
│   ├── AvatarBadge.tsx                   Shared avatar with initials fallback
│   ├── NavBar.tsx                        Global nav + login/logout modal
│   ├── SessionContext.tsx                Auth state context
│   └── LandingPage.tsx                   Home page with CTA
├── hooks/
│   ├── useTypeahead.ts                   Debounced Bluesky handle typeahead
│   ├── useScanStream.ts                  NDJSON streaming fetch + EntryIndex
│   └── useDebounce.ts                    Generic debounce hook
├── data/
│   ├── catalog/*.json                    One file per steward — manual funding data
│   └── resolver-catalog.json             NSID prefix → steward URI overrides
└── lib/
    ├── pipeline/
    │   ├── account-gather.ts             Phase 1: discover accounts + fire prefetches
    │   ├── account-enrich.ts             Phase 4: fund.at + catalog + profile resolution
    │   ├── capability-scan.ts            Phase 5: feed/labeler capabilities
    │   ├── dep-resolve.ts                Phase 6: dependency entry resolution
    │   ├── ecosystem-scan.ts             Phase 3: ecosystem URI discovery from endorsement map
    │   ├── entry-resolve.ts              Full vertical: single-entry pipeline
    │   └── scan-stream.ts                Orchestrator: creates ScanContext, runs phases, emits events
    ├── scan-context.ts                   ScanContext type + createScanContext() — app-wide network orchestrator
    ├── fund-at-prefetch.ts               Speculative fund.at prefetch with bounded concurrency
    ├── microcosm.ts                      Phase 2: network endorsement collection (Slingshot + PDS)
    ├── catalog.ts                        resolveStewardUri + lookupManualStewardRecord
    ├── steward-model.ts                  Identity, Funding, StewardEntry, Capability types
    ├── identity.ts                       buildIdentity, batchFetchProfiles, resolveRefToDid
    ├── funding.ts                        resolveFunding, resolveFundingForDep, lookupManualByIdentity
    ├── entry-priority.ts                 Unified entryPriority() ranking (tiers 0–5)
    ├── steward-merge.ts                  EntryIndex (client-side dedup) + merge logic
    ├── steward-funding.ts                fetchFundAtForStewardDid (PDS fund.at.* fetch)
    ├── fund-at-records.ts                Low-level fund.at record fetching (parallel PDS calls)
    ├── follow-scan.ts                    Standalone follow scan (accepts ScanContext)
    ├── subscriptions-scan.ts             Standalone subscriptions scan (accepts ScanContext)
    ├── atfund-dns.ts                     _atproto DNS TXT → DID
    ├── atfund-uri.ts                     URI-like → hostname → PDS host funding
    ├── concurrency.ts                    runWithConcurrency() bounded parallel helper
    ├── merge-deps.ts                     Dependency list union helper
    ├── repo-inspect.ts                   Filter noise collections (Bluesky core)
    ├── repo-collection-resolve.ts        Calendar createdWith + Standard.site $type
    ├── steward-uri.ts                    normalizeStewardUri (input validation)
    ├── auth/kv-store.ts                  Upstash Redis (OAuth session store + endorsement cache)
    └── xrpc.ts                           Raw XRPC query helper + singleflight cache
```

## Lexicon schemas

- `fund.at.contribute` — funding page URL (singleton, rkey `self`)
- `fund.at.dependency` — upstream dependency entries (rkey = URI)
- `fund.at.endorse` — endorsement entries (rkey = endorsed URI)

See the in-app lexicon page (`/lexicon`) for full schema documentation.

## Error handling strategy

The pipeline is designed for **graceful degradation** — a failure in any
individual account, fetch, or resolution step should never crash the scan.
The user sees partial results with warnings rather than a blank page.

### Principles

1. **Best-effort operations** — profile fetches, fund.at lookups, DNS
   resolution, and capability fetches all catch errors and continue. A failed
   batch doesn't block other batches.

2. **Warnings, not exceptions** — non-fatal errors emit `warning` events via
   the NDJSON stream. The client displays these to the user. Warnings carry a
   `step` identifier for tracing (e.g. `fund-at-fetch`, `profile-batch`,
   `dns-lookup`).

3. **Fallback chains** — funding resolution tries fund.at → manual catalog →
   unknown. Identity resolution tries handle → DNS → raw ref. Each level
   catches independently.

4. **Scan-level errors are fatal** — if the orchestrator itself fails (e.g.
   session expired, stream encoding error), the scan aborts. The client handles
   this via `authFetch` (401 → logout + reload) or the stream error handler.

### Per-phase error behavior

| Phase | Failure mode | Behavior |
|-------|-------------|----------|
| 1. Gather | Follow pagination fails | Emit warning, continue with partial follows |
| 1. Gather | Repo listRecords fails | Emit warning, skip repo-based tool discovery |
| 1. Gather | Steward URI DNS fails | Entry dropped (DID-first requires resolved DID) |
| 2. Endorsements | PDS unreachable for a follow | Skip that follow's endorsements, continue |
| 2. Endorsements | Redis cache read/write fails | Fall back to in-memory, log warning |
| 3. Ecosystem | No failures possible | Pure in-memory lookup against endorsement map |
| 4. Enrich | Profile batch fails | Use partial profile data (handle/DID only) |
| 4. Enrich | fund.at PDS fetch fails | Emit warning, fall back to manual catalog |
| 4. Enrich | Manual catalog miss | Mark `source: 'unknown'` |
| 5. Capabilities | Feed generator fetch fails | Skip capabilities for that DID |
| 5. Capabilities | Labeler fetch fails | Skip labeler capability |
| 6. Dependencies | Dep resolution fails | Omit that dependency entry |

### Timeout behavior

- **Vercel**: `maxDuration = 180` (3 minutes). Large follow lists may timeout.
  When this happens, the client receives whatever events were emitted before
  the cutoff. The `done` event will be missing; the client detects this as an
  incomplete scan.
- **Client login**: 15-second timeout with user-facing message.
- **Individual fetches**: No per-request timeout (relies on Node.js/browser
  defaults). The bounded concurrency limits (20 prefetch, 10 enrich, 20
  endorsement) prevent runaway parallelism.

### Client-side error handling

- **401 from any `authFetch` call** → `invalidateSession()` + full page reload
- **Stream read error** → scan marked as errored, user sees error message
- **Missing `done` event** → scan treated as incomplete (partial results shown)
- **Network offline** → fetch throws, caught by stream handler
