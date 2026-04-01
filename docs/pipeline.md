# Scan pipeline

End-to-end flow from user sign-in to rendered account cards.

## Overview

The app answers one question: **what ATProto tools, feeds, and labelers has this user actually used, and how can they support those projects?**

Everything is account-centric. A card represents an **ATProto account** (identified by DID), and feeds, labelers, and tools are **capabilities** that account provides. The pipeline has four phases with clear boundaries:

```
Phase 1: GATHER     Discover every account the user has a relationship with
Phase 2: ENRICH     Resolve funding info (fund.at, manual catalog, profiles)
Phase 3: CAPABILITIES   Attach feed/labeler details to enriched accounts
Phase 4: DEPENDENCIES   Resolve referenced entries for drill-down modal
```

## Phase 1: Gather accounts

**File:** `src/lib/pipeline/account-gather.ts`

Collects every DID the user has a relationship with. No fund.at lookups — just discovery.

### Sources

| Source | How | Tag |
|--------|-----|-----|
| Repo collections | NSIDs + `createdWith` + `$type` → resolver catalog → steward URI → DNS → DID | `tool` |
| Follows | `app.bsky.graph.getFollows` (paginated, ALL follows) | `follow` |
| Feed subscriptions | `app.bsky.actor.getPreferences` → saved feed URIs → extract creator DID | `feed` |
| Labeler subscriptions | `app.bsky.actor.getPreferences` → labeler DIDs | `labeler` |
| Self-reported | User-provided hostnames/DIDs from "Add to watch list" | `tool` |

### Output

```typescript
type GatherResult = {
  did: string
  handle?: string
  pdsUrl?: string
  accounts: Map<string, AccountStub>      // DID → stub with tags + hostnames
  unresolvedServices: UnresolvedService[]  // hostnames that didn't resolve to a DID
  warnings: ScanWarning[]
  feedUris: string[]                       // AT URIs for Phase 3
  labelerDids: string[]                    // DIDs for Phase 3
}
```

An `AccountStub` accumulates tags from multiple sources. If the same DID appears as a tool AND a follow AND a feed creator, it gets all three tags on one stub.

### Unresolved services

When a steward URI (hostname) doesn't resolve to a DID via DNS, it becomes an `UnresolvedService`. These are still shown as "discover" cards — the user relies on the service, we just can't identify the ATProto account behind it.

### Steward URI resolution

Observed keys (NSIDs, URLs, `$type` values) pass through `resolveStewardUri()` from `src/lib/catalog.ts`:

1. Check `resolver-catalog.json` overrides (longest prefix match)
2. If starts with `did:` → return as-is
3. If contains `://` → extract hostname
4. If 3+ dot segments → NSID; infer hostname from first two segments
5. If 1-2 dot segments → already a hostname; normalize and return

## Phase 2: Enrich accounts

**File:** `src/lib/pipeline/account-enrich.ts`

For each account, resolves funding info by trying **every key type**. This is where the hostname-vs-DID mismatch is handled — we try all keys in one place.

### Resolution order

For each `AccountStub`:

1. **Batch profile resolution** — `app.bsky.actor.getProfiles` for accounts missing handles/displayNames
2. **fund.at records** — `fetchFundAtForStewardDid(did)` from the steward's PDS
3. **Manual catalog by DID** — `lookupManualStewardRecord(did)`
4. **Manual catalog by hostname** — `lookupManualStewardRecord(hostname)` for each associated hostname
5. **Manual catalog by handle** — `lookupManualStewardRecord(handle)`
6. **Fallback** — `source: 'unknown'`

### URI and displayName selection

- `uri`: hostname preferred (readable), then handle, then DID
- `displayName`: profile name preferred (non-DID), then hostname, then handle, then DID

### Output

One `StewardEntry` per account, plus entries for unresolved services.

## Phase 3: Attach capabilities

**File:** `src/lib/pipeline/capability-scan.ts`

Fetches display info for feeds and labelers, then attaches them as `Capability` objects on the account's entry.

### Feeds

`app.bsky.feed.getFeedGenerators(feedUris)` returns per-feed info:
- `displayName` — the feed's name (e.g., "Discover")
- `creator.did` — matched to an existing entry
- `uri` — AT URI, parsed for rkey
- `landingPage` — constructed as `https://bsky.app/profile/{handle}/feed/{rkey}`

Multiple feeds by the same creator become multiple capabilities on one card.

### Labelers

`app.bsky.labeler.getServices(dids)` returns labeler info:
- `creator.displayName` — the labeler name
- `landingPage` — Bluesky profile link

### Capability type

```typescript
type Capability = {
  type: 'feed' | 'labeler'
  name: string
  description?: string
  uri?: string
  landingPage?: string
}
```

## Phase 4: Resolve dependencies

**File:** `src/lib/pipeline/dep-resolve.ts`

For entries with `dependencies[]`, looks up each dependency URI in the manual catalog. These "referenced entries" power the dependency drill-down modal — they're not shown as primary cards.

## Orchestration

**File:** `src/lib/pipeline/scan-stream.ts`

`scanStreaming()` runs all four phases and emits `ScanStreamEvent` objects for the client to consume progressively:

1. Phase 1 → `status` events during discovery, `meta` event with user info, `warning` events
2. Phase 2 → `entry` events as each account is enriched
3. Phase 3 → updated `entry` events with capabilities attached
4. Phase 4 → `referenced` events for dependency entries
5. PDS host funding → `pds-host` event
6. `done` event

### Client-side merging

The client (`GiveClient.tsx`) uses `EntryIndex` from `steward-merge.ts` to deduplicate entries by DID as they stream in. When Phase 3 re-emits entries with capabilities, the merge unions them correctly.

## Rendering

### Card variants

| Variant | Condition | Style |
|---------|-----------|-------|
| `support` | Has `tool`, `labeler`, or `feed` tag | Green left border |
| `network` | Only has `follow` tag | Violet left border |
| `discover` | `source === 'unknown'` | Amber dashed border |

### Card anatomy

```
[Droplet icon]  Title  @handle  tag  tag
                Description text
                ┌ Provides ──────────────┐
                │ Feed Name              │
                │ Another Feed           │
                └────────────────────────┘
                ┌ Depends on ────────────┐
                │ dep-name               │
                └────────────────────────┘
```

- **Title**: Links to domain (tools) or Bluesky profile (non-tools)
- **@handle**: Always clickable, links via DID for provenance
- **Tags**: Inline to the right of handle
- **Capabilities**: "Provides" section with clickable feed/labeler names
- **Dependencies**: "Depends on" section with drill-down modal

### Filtering

Filter pills (Tools, Feeds, Labelers, Network) filter by tag. Since an account can have multiple tags, the same card may appear in multiple filtered views — showing the full card each time.

### Visibility rules

- Tools, labelers, feeds: always visible
- Follows: only visible if they have a `contributeUrl`

## File map

```
src/
├── app/
│   ├── page.tsx                          Landing page
│   ├── give/page.tsx                     Give page (requires auth)
│   └── api/lexicons/
│       ├── route.ts                      Non-streaming API (legacy)
│       └── stream/route.ts              Streaming API → scanStreaming()
├── components/
│   ├── GiveClient.tsx                    Client: streaming scan, card layout, filters
│   ├── ProjectCards.tsx                  Card components: StewardCard, PdsHostSupportCard
│   ├── NavBar.tsx                        Global nav + login/logout modal
│   ├── SessionContext.tsx                Auth state context
│   └── LandingPage.tsx                   Home page with CTA
├── data/
│   ├── catalog/*.json                    One file per steward — manual funding data
│   └── resolver-catalog.json            NSID prefix → steward URI overrides
└── lib/
    ├── pipeline/
    │   ├── account-gather.ts             Phase 1: discover accounts + unresolved services
    │   ├── account-enrich.ts             Phase 2: fund.at + catalog + profile resolution
    │   ├── capability-scan.ts            Phase 3: feed/labeler capabilities
    │   ├── dep-resolve.ts                Phase 4: dependency entry resolution
    │   └── scan-stream.ts                Orchestrator: runs phases, emits stream events
    ├── catalog.ts                        resolveStewardUri + lookupManualStewardRecord
    ├── steward-model.ts                  StewardEntry, Capability, StewardTag types
    ├── steward-merge.ts                  EntryIndex (client-side dedup) + merge logic
    ├── steward-funding.ts                fetchFundAtForStewardDid (PDS fund.at.* fetch)
    ├── fund-at-records.ts                Low-level fund.at record fetching
    ├── atfund-dns.ts                     _atproto DNS TXT → DID
    ├── atfund-uri.ts                     URI-like → hostname → PDS host funding
    ├── atfund-steward.ts                 PdsHostFunding type + fetch
    ├── repo-inspect.ts                   Filter noise collections (Bluesky core)
    ├── repo-collection-resolve.ts        Calendar createdWith + Standard.site $type
    ├── steward-uri.ts                    normalizeStewardUri (input validation)
    └── xrpc.ts                           Raw XRPC query helper
```

## Lexicon schemas

- `fund.at.contribute` — funding page URL (singleton, rkey `self`)
- `fund.at.dependency` — upstream dependency entries (rkey = URI)
- `fund.at.watch` — watchlist entries (rkey TID)

See the in-app lexicon page (`/lexicon`) for full schema documentation.
