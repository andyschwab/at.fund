# funding.json Integration Design

> at.fund is a signal layer, not a payment platform. This design integrates the
> [funding.json](https://fundingjson.org/) open standard as an optional
> machine-readable enrichment layer — adding depth without adding burden.

## Architecture

```
┌───────────────────────────────────────────────────┐
│                  Steward's Domain                  │
│                                                    │
│  fund.at.contribute { url }    (ATProto record)    │
│  /funding.json                 (optional, static)  │
│  /.well-known/funding-manifest-urls  (optional)    │
└───────────────────────────────────────────────────┘
                        │
           at.fund reads all three layers
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
  ATProto record   Contribute URL   funding.json
  (DID-signed,     (human action,   (machine-readable,
   always present)  always present)  optional richness)
```

### The three layers

| Layer | Owner | Purpose | Required? |
|-------|-------|---------|-----------|
| `fund.at.contribute` | Steward (via PDS) | Signed declaration: "here is my funding page" | Yes (core) |
| Contribute URL | Steward (any web page) | Human-friendly landing: donations, billing, anything | Yes (core) |
| `funding.json` | Steward (static file on their domain) | Machine-readable: channels, plans, history | No (enrichment) |

The contribute URL stays exactly as it is — a single, unopinionated pointer.
funding.json is progressive enhancement: when present, at.fund renders richer
cards. When absent, everything works as it does today.

## Data model changes

### New types: `src/lib/funding-manifest.ts`

```typescript
/**
 * Subset of the funding.json v1 spec that at.fund consumes.
 * We intentionally only parse what we display — we are a reader,
 * not a validator.
 */

export type FundingChannel = {
  guid: string
  type: 'bank' | 'payment-provider' | 'cheque' | 'cash' | 'other'
  address: string
  description?: string
}

export type FundingPlan = {
  guid: string
  status: 'active' | 'inactive'
  name: string
  description?: string
  amount: number
  currency: string            // ISO 4217
  frequency: 'one-time' | 'weekly' | 'fortnightly' | 'monthly' | 'yearly' | 'other'
  channels: string[]          // references Channel GUIDs
}

export type FundingHistory = {
  year: number
  income: number
  expenses: number
  taxes: number
  currency: string
  description?: string
}

export type FundingManifest = {
  version: string
  entity: {
    type: string
    role: string
    name: string
    description: string
  }
  funding: {
    channels: FundingChannel[]
    plans: FundingPlan[]
    history?: FundingHistory[]
  }
}
```

### StewardEntry extension: `src/lib/steward-model.ts`

```typescript
export type StewardEntry = {
  // ... existing fields unchanged ...

  /** Optional enrichment from a funding.json manifest on the steward's domain. */
  fundingManifest?: FundingManifest
}
```

This is additive — no existing fields change, no existing behavior breaks.

## Pipeline integration

### Where it plugs in

The enrichment flow currently (in `account-enrich.ts`):

```
1. Try fund.at records by DID    →  contributeUrl + dependencies
2. Fall back to manual catalog   →  contributeUrl + dependencies
3. Give up                       →  source: 'unknown'
```

funding.json becomes a **parallel enrichment** alongside step 1:

```
1a. Try fund.at records by DID      →  contributeUrl + dependencies
1b. Try funding.json by hostname    →  channels, plans, history
    (runs concurrently with 1a)
2.  Fall back to manual catalog
3.  Give up
```

### Fetch logic: `src/lib/funding-manifest.ts`

```typescript
const FUNDING_JSON_TIMEOUT = 5_000  // don't slow the pipeline

/**
 * Attempt to fetch a funding.json from a steward's domain.
 * Returns null on any failure — this is always best-effort.
 */
export async function fetchFundingManifest(
  hostname: string,
): Promise<FundingManifest | null> {
  const url = `https://${hostname}/funding.json`
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FUNDING_JSON_TIMEOUT),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return null

    const json = await res.json()
    if (!json?.version?.startsWith('v1')) return null
    if (!json?.funding?.channels?.length) return null

    return json as FundingManifest
  } catch {
    return null  // network error, timeout, invalid JSON — all fine
  }
}
```

### Integration in `account-enrich.ts`

Inside the per-account concurrency loop, after building the base entry:

```typescript
// 1a. Try fund.at records by DID (existing)
// 1b. Try funding.json by hostname (new — concurrent with 1a)
const [fundAt, manifest] = await Promise.all([
  fetchFundAtForStewardDid(stub.did).catch(() => null),
  hostname ? fetchFundingManifest(hostname).catch(() => null) : null,
])

// Attach manifest if found (regardless of which source "wins")
if (manifest) {
  entry.fundingManifest = manifest
}
```

The manifest attaches to the entry independently of which source provides the
contributeUrl. A steward might have a fund.at record pointing to their landing
page AND a funding.json with structured channel data — both are valid.

### Integration in single-entry resolution (`entry-resolve.ts`)

Same pattern: fire `fetchFundingManifest(hostname)` alongside the existing
fund.at fetch, attach if found.

## UI changes

### Phase 1: Indicator only

When a `fundingManifest` is present, show a small indicator on the card that
structured funding data is available. The Fund button still opens the
contributeUrl — we don't change the primary action.

```tsx
{entry.fundingManifest && (
  <span
    title="This project publishes structured funding data"
    className="text-[10px] text-emerald-500"
  >
    ✓ funding.json
  </span>
)}
```

### Phase 2: Expandable funding details

Show channels and active plans in a collapsible section below the card,
similar to how dependencies are shown today:

```
┌──────────────────────────────────────────┐
│  mozzius.dev                             │
│  Creator of Graysky                      │
│  12 endorsements from your network       │
│                                     Fund │
│                                          │
│  ▸ Funding channels (3)                  │
│    GitHub Sponsors · Open Collective     │
│    Ko-fi                                 │
│                                          │
│  ▸ Plans                                 │
│    $5/mo Supporter · $25/mo Sustainer    │
│                                          │
│  ▸ Dependencies (2)                      │
└──────────────────────────────────────────┘
```

Each channel links to its address URL. Plans show amount, currency, frequency.
Everything is read from the manifest — at.fund renders but never stores it.

### Phase 3: Platform grouping in the overview

Above the card list, show aggregate insights:

```
You can support 8 projects via GitHub Sponsors, 3 via Open Collective.
[View by platform →]
```

This requires parsing channel addresses to identify platforms — a simple
URL-to-platform mapper (github.com/sponsors/* → GitHub Sponsors, etc.).

## Setup page integration

### Phase 1: Education

On the `/setup` page, after the user sets their contribute URL:

> **Want richer funding cards?** Publish a `funding.json` file on your domain
> to show payment channels, tiers, and plans. [Learn more →](https://fundingjson.org/)

### Phase 2: Generator

Add a section that pre-fills a funding.json template from the steward's
existing fund.at data:

```json
{
  "version": "v1.0.0",
  "entity": {
    "type": "individual",
    "role": "maintainer",
    "name": "{{displayName}}",
    "email": "",
    "description": "{{description}}",
    "webpageUrl": { "url": "https://{{hostname}}" }
  },
  "projects": [],
  "funding": {
    "channels": [{
      "guid": "primary",
      "type": "payment-provider",
      "address": "{{contributeUrl}}",
      "description": ""
    }],
    "plans": [{
      "guid": "support",
      "status": "active",
      "name": "Support",
      "amount": 0,
      "currency": "USD",
      "frequency": "monthly",
      "channels": ["primary"]
    }]
  }
}
```

"Copy this file to your domain at `/funding.json`."

## What at.fund does NOT do

- **Does not validate manifests** — we're a lenient reader, not a gatekeeper.
  If the JSON parses and has the fields we need, we use it. The
  [official validator](https://dir.floss.fund/validate) exists for strict
  validation.

- **Does not store manifests** — fetched at scan time, attached to the
  in-memory entry, never persisted. The steward's domain is the source of
  truth.

- **Does not intermediate payments** — channels link to external platforms.
  at.fund renders the links, the user clicks through.

- **Does not require funding.json** — the contribute URL is always sufficient.
  funding.json is progressive enhancement.

- **Does not prefer any platform** — channels are displayed in the order the
  steward declares them. No ranking, no featuring, no commission.

## Value at.fund adds beyond funding.json

| funding.json declares | at.fund enriches with |
|---|---|
| "Here are my payment channels" | "12 people you follow support this via GitHub Sponsors" |
| "I have a $25/mo tier" | "3 of your favorite feed authors are all on Open Collective" |
| "My annual income was $50k" | "This project has 200 endorsements but only $2k/yr in funding" |
| "I maintain these projects" | "You depend on 4 of them transitively" |
| (static, per-project) | (social, per-viewer, real-time) |

The social graph, endorsement signal, and dependency awareness are at.fund's
unique contribution. funding.json provides the structured payment data that
makes those insights actionable.

## Implementation phases

### Phase 1: Read (this PR)
- [ ] Add `FundingManifest` types
- [ ] Add `fetchFundingManifest()` fetcher with timeout + error handling
- [ ] Wire into `account-enrich.ts` as concurrent fetch
- [ ] Wire into `entry-resolve.ts` for single-entry resolution
- [ ] Add `fundingManifest?` to `StewardEntry`
- [ ] Show "funding.json" indicator badge on cards that have it
- [ ] Stream the manifest data through `ScanStreamEvent`

### Phase 2: Display
- [ ] Render funding channels as clickable links below the card
- [ ] Render active plans with amount/currency/frequency
- [ ] URL-to-platform mapper for recognized channel addresses
- [ ] Platform icons (GitHub, Open Collective, Ko-fi, Patreon, etc.)

### Phase 3: Guide
- [ ] Education callout on `/setup` page
- [ ] funding.json generator pre-filled from fund.at data
- [ ] Link to fundingjson.org validator

### Phase 4: Aggregate
- [ ] Platform grouping in overview ("8 projects via GitHub Sponsors")
- [ ] "Fund the stack" — dependency chain with summed plan amounts
- [ ] Cross-reference endorsement counts with funding history

## Upstream contributions

As at.fund becomes a major consumer of funding.json, we should contribute back:

1. **Richer channel types** — `payment-provider` is too coarse. Propose:
   `github-sponsors`, `open-collective`, `patreon`, `ko-fi`, `liberapay`,
   `stripe`, `paypal`, `interledger`, `crypto`, etc. This helps all consumers
   render platform-specific UX.

2. **JSON Schema file** — The spec currently validates via Go code only.
   A `.schema.json` would enable editor autocompletion and browser-side
   validation, lowering the barrier to adoption.

3. **Non-FOSS use cases** — The spec assumes open source (SPDX licenses,
   repository URLs). Many ATProto community members are creators, service
   operators, or nonprofits. Propose optional fields or looser validation
   for non-code projects.

4. **ATProto identity** — Propose a `did` field on the entity, allowing
   cryptographic proof of authorship beyond DNS-based `.well-known` verification.
