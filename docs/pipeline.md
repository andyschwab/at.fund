# Steward discovery pipeline

End-to-end flow from user sign-in to rendered steward cards.

## Overview

The app answers one question: **what ATProto tools has this user actually used, and how can they support those projects?**

Everything is steward-centric. A **steward URI** (hostname like `whtwnd.com` or a DID like `did:plc:...`) is the canonical identifier for a project or service. NSIDs never reach the UI — they're resolved into steward URIs early in the pipeline and stay encapsulated after that.

```
User signs in
  → repo collections + special record inspection
  → set of "observed keys" (NSIDs, createdWith URLs, content $types)
  → resolver catalog maps each key to a steward URI
  → for each steward URI:
      try fund.at.* records from the steward's PDS
      fall back to catalog/*.json
      or mark as "unknown"
  → render steward cards
```

## 1. Triggering a scan

Two entry points, same pipeline:

| Entry | File | When |
|-------|------|------|
| Server-side initial load | `src/app/page.tsx` | Page load with active session |
| Client-side refresh / add-more | `POST /api/lexicons` via `src/app/api/lexicons/route.ts` | User clicks Refresh or Add to list |

Both call `scanRepo(session, selfReportedStewards)` from `src/lib/lexicon-scan.ts`.

Self-reported steward URIs arrive as `{ selfReportedStewards: string[] }` in the POST body. The API route normalizes each through `normalizeStewardUri` (`src/lib/steward-uri.ts`) before passing them to `scanRepo`.

## 2. Collecting observed keys

Inside `scanRepo`:

### 2a. Repo collection list

```
describeRepo(session.did)
  → collections[]
  → filterThirdPartyCollections (repo-inspect.ts)
      drops app.bsky.*, com.atproto.*, chat.bsky.*
  → thirdParty[]
```

### 2b. Static collections

```
stripDerivedCollections(thirdParty)
  → removes calendar and site.standard.* NSIDs (handled separately)
  → staticCols[]
```

Each static collection NSID (e.g. `space.roomy.space.personal`) becomes an observed key.

### 2c. Calendar `createdWith` resolution

```
resolveCalendarCatalogKeys(agent, did, thirdParty)
  → for each community.lexicon.calendar* collection:
      listRecords → read record.value.createdWith
  → calendarKeys[] (URLs like "https://atmo.rsvp")
```

### 2d. Standard.site content type resolution

```
resolveSiteStandardPairs(agent, did, thirdParty)
  → for each site.standard.* collection:
      listRecords → read record.value.content.$type
  → SiteStandardPair[] (contentType strings like "pub.leaflet.doc")
```

Only `pair.contentType` enters the observed set — the `site.standard.*` collection NSID itself is dropped.

### 2e. Self-reported stewards

User-supplied steward URIs (hostnames or DIDs) are merged into the same observed set.

### Result

```typescript
observed = Set<string> {
  ...staticCols,      // NSIDs
  ...calendarKeys,    // URLs
  ...contentTypes,    // NSID-like $type values
  ...selfReported,    // hostnames or DIDs
}
```

## 3. Observed keys → steward URIs

Each observed key passes through `resolveStewardUri(key)` from `src/lib/catalog.ts`:

```
1. Check resolver-catalog.json overrides (longest prefix match)
2. If starts with "did:" → return as-is
3. If contains "://" → extract hostname
4. If 3+ dot segments → NSID; infer hostname from first two segments
   (e.g. space.roomy.space.personal → roomy.space)
5. If 1-2 dot segments → already a hostname; normalize and return
```

### Resolver catalog overrides

`src/data/resolver-catalog.json` handles cases where NSID inference would give the wrong hostname:

| matchPrefix | stewardUri | Why |
|-------------|------------|-----|
| `chat.bsky.` | `bsky.app` | Same steward as `app.bsky.*` |
| `tools.ozone.` | `bsky.app` | Bluesky-maintained moderation tools |
| `fyi.unravel.frontpage.` | `frontpage.fyi` | Sub-namespace of `fyi.unravel.*` |
| `im.flushing.right.now.` | `flushes.app` | 4-segment authority would infer `flushing.im` |
| `com.shinolabs.pinksea.` | `pinksea.art` | Different brand domain |
| `blue.zio.atfile.` | `zio.sh` | Different brand domain |
| ... | ... | (see file for full list) |

### NSID hostname inference

For 3+ segment strings without an override, `inferHostnameFromNsidLike` reverses the first two dot segments:

```
events.smokesignal.calendar.event → smokesignal.events
com.whtwnd.blog.entry             → whtwnd.com
pub.leaflet.interactions.bookmark → leaflet.pub
```

### Output

A deduplicated, sorted `Set<string>` of steward URIs (hostnames and/or DIDs).

## 4. Steward URIs → card models

For each steward URI, in order:

### 4a. DNS DID lookup

If the steward URI is a hostname, resolve `_atproto.<hostname>` DNS TXT to get the steward's DID.

```
lookupAtprotoDid(stewardUri)  →  stewardDid | null
```

(Implemented in `src/lib/atfund-dns.ts`.)

### 4b. Try fund.at.* records (primary path)

If we have a DID, attempt `fetchFundAtForStewardDid(stewardDid)` from `src/lib/steward-funding.ts`:

1. Resolve DID → PDS URL (via public identity API)
2. `listRecords` for `fund.at.disclosure`, `fund.at.contribute`, `fund.at.dependencies`
3. Pick best disclosure by `effectiveDate` (must have usable `meta`)
4. Pick best contribute by `effectiveDate` (must have links)
5. Merge host-scoped dependency URIs (ignoring NSID-scoped records)

If disclosure exists → `StewardCardModel` with `source: 'fund.at'`.

**Note:** This path does NOT apply `restrictToDomains` filtering — that's intentional. Steward cards show the steward's general metadata. Domain-scoped filtering is only used for PDS host funding (step 6).

### 4c. Manual catalog fallback

If no fund.at records found, look up `lookupManualStewardRecord(stewardUri)` from `src/lib/catalog.ts`:

Reads per-steward JSON files from `src/data/catalog/`, each shaped like a real `fund.at.*` record. For example, `src/data/catalog/whtwnd.com.json`:

```json
{
  "disclosure": {
    "meta": {
      "displayName": "WhiteWind",
      "description": "Long-form blogging on ATProto.",
      "landingPage": "https://whtwnd.com"
    }
  },
  "contribute": {
    "links": [{ "label": "...", "url": "..." }]
  },
  "dependencies": {
    "uris": ["other-steward.com"]
  }
}
```

If found → `StewardCardModel` with `source: 'manual'`.

### 4d. Unknown fallback

If neither fund.at nor manual catalog have data → `StewardCardModel` with `source: 'unknown'`, `displayName: stewardUri`.

### Output

```typescript
StewardCardModel {
  stewardUri: string
  stewardDid?: string
  displayName: string
  description?: string
  landingPage?: string
  links?: FundLink[]          // fund.at.contribute links (funding actions)
  dependencies?: string[]     // fund.at.dependencies URIs
  source: 'fund.at' | 'manual' | 'unknown'
}
```

## 5. PDS host funding (separate path)

Independently of steward cards, the user's home PDS may also publish fund.at records:

```
DID document → PDS URL → hostname → _atproto DNS → PDS steward DID
  → fetchPdsHostFunding(stewardDid, pdsHostname)
```

This path DOES apply `restrictToDomains` filtering against the PDS hostname. It uses `src/lib/atfund-steward.ts` (via `src/lib/atfund-uri.ts`).

Result is `PdsHostFunding` — rendered as a separate "Your host" card above steward cards.

## 6. Rendering

`src/components/HomeClient.tsx` splits stewards into two groups:

| Group | Filter | Component |
|-------|--------|-----------|
| Known | `source !== 'unknown'` | `KnownStewardCard` |
| Unknown | `source === 'unknown'` | `UnknownStewardCard` |

### KnownStewardCard

Renders from `StewardCardModel`:
- **Display name** from `displayName`
- **Description** from `description`
- **Website button** from `landingPage` (disclosure metadata)
- **Contribute CTA** from `links[0]` (only if the steward has published a funding link)
- **Dependencies** from `dependencies` (listed as steward URIs)

### UnknownStewardCard

Shows the steward URI as the title with a prompt to get listed.

### PdsHostSupportCard

Shows PDS host disclosure, landing page, contribute link, and dependencies.

## File map

```
src/
├── app/
│   ├── page.tsx                    Server page: initial scanRepo call
│   └── api/lexicons/route.ts      API: GET/POST → scanRepo
├── components/
│   ├── HomeClient.tsx              Client shell: login, scan, card layout
│   └── ProjectCards.tsx            PdsHostSupportCard, KnownStewardCard, UnknownStewardCard
├── data/
│   ├── catalog/*.json               One file per steward — curated fund.at-shaped records
│   └── resolver-catalog.json       NSID prefix → steward URI overrides
└── lib/
    ├── catalog.ts                  resolveStewardUri + lookupManualStewardRecord
    ├── lexicon-scan.ts             scanRepo orchestration
    ├── steward-funding.ts          fetchFundAtForStewardDid (PDS fund.at.* fetch)
    ├── steward-model.ts            StewardCardModel type
    ├── steward-uri.ts              normalizeStewardUri (API input validation)
    ├── atfund-steward.ts           fetchPdsHostFunding (domain-scoped)
    ├── atfund-dns.ts               _atproto DNS TXT → DID
    ├── atfund-uri.ts               URI-like → hostname → PDS host funding
    ├── repo-inspect.ts             Filter noise collections (Bluesky core)
    └── repo-collection-resolve.ts  Calendar createdWith + Standard.site $type extraction
```

## Lexicon schemas

- [`fund.at.disclosure`](../lexicon/fund.at.disclosure.json) — identity, contact, security, legal pointers
- [`fund.at.contribute`](../lexicon/fund.at.contribute.json) — funding/contribution entry points
- [`fund.at.dependencies`](../lexicon/fund.at.dependencies.json) — steward URI dependency pointers

See also: [atfund-discovery.md](atfund-discovery.md) for DNS discovery details.
