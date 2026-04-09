# Open Collective Integration Analysis

> How at.fund can deeply integrate with Open Collective to help stewards and
> their dependencies get paid.

**Date:** 2026-04-09
**Status:** Analysis / proposal

---

## Current State

at.fund already recognizes Open Collective as a `KnownPlatform`:

- **Detection:** `opencollective.com/` regex in `funding-manifest.ts:60`
- **Label:** "Open Collective" in card channel buttons
- **Catalog entries:** 6 projects point to OC contribute URLs (blacksky, smoke-signal, atprotocoldev, wedistribute, lockdown-systems/cyd, blacksky.community)

But today, OC is treated as a **dumb link** — identical to any other funding
platform. Users click through to opencollective.com and the at.fund experience
ends. There's no data enrichment, no tier awareness, no dependency-graph
integration, and no way to fund multiple deps in a single flow.

## What Open Collective Offers

### GraphQL API v2

**Endpoint:** `https://api.opencollective.com/graphql/v2`

- **Unauthenticated:** 10 req/min — enough for on-demand enrichment
- **Authenticated (API key):** 100 req/min — enough for batch pipeline use

Publicly queryable data per collective (by slug):

| Field | What it gives us |
|-------|-----------------|
| `name`, `slug`, `description`, `imageUrl` | Identity enrichment — OC profile data |
| `tiers { nodes { name, amount, frequency, description } }` | Structured tier/plan data |
| `members { nodes { role, account, totalDonations } }` | Contributor list, backer count |
| `stats { totalAmountReceived, yearlyBudget, contributorsCount }` | Financial health signals |
| `host { slug, name }` | Fiscal host (e.g. Open Source Collective) |
| `transactions`, `expenses` | Cash flow transparency |

### Contribution Flow URL Parameters

OC supports deep-linked, pre-filled contribution URLs:

```
https://opencollective.com/{slug}/donate?amount=10&interval=month
https://opencollective.com/{slug}/contribute/{tier-slug}-{tier-id}/checkout
https://opencollective.com/{slug}/donate/profile?interval=month&amount=3.33&contributeAs=me
```

Parameters: `amount`, `interval` (month/year), `platformTip`,
`skipStepDetails`, `contributeAs`.

### Embeddable Checkout

```html
<iframe src="https://opencollective.com/embed/{slug}/donate"
        style="width: 100%; min-height: 100vh;"></iframe>
```

Tier-specific embeds also available by swapping `/donate` for the tier path.

### Fiscal Host Model

Collectives don't hold money — a **fiscal host** does. Most OSS projects use
Open Source Collective (501c6). This means:

- **Collective-to-collective contributions** within the same fiscal host are
  instant balance transfers (no payment processor fees)
- A collective can **expense funds to other collectives** as grants
- Fiscal hosts handle taxes, compliance, and payouts

### Ecosystem Funds (via ecosyste.ms partnership)

OC's Ecosystem Funds automatically distribute donations to a language/framework
ecosystem's dependencies:

- 291 ecosystems supported
- Monthly allocation for funds > $1,000
- 10% management fee
- Maintainers invited to claim; unclaimed funds redistribute

### Back Your Stack

Scans a project's dependency tree and maps deps to OC collectives. Enables bulk
"fund all my deps" flows. Similar in spirit to what at.fund does for ATProto,
but limited to package manager dependency trees.

---

## Integration Tiers

### Tier 1: OC-Enriched Cards (read-only, low effort)

**Goal:** When a steward has an OC collective, show richer data on their card
without requiring them to configure fund.at records.

#### 1a. Auto-import tiers as FundingPlans

When we detect an OC contribute URL (via `detectPlatform`), extract the slug
and query the GraphQL API for tiers:

```graphql
query($slug: String!) {
  account(slug: $slug) {
    name
    slug
    tiers {
      nodes {
        id
        legacyId
        slug
        name
        description
        amount { valueInCents currency }
        interval
        type
      }
    }
  }
}
```

Map OC tiers to `FundingPlan[]`:

| OC tier field | FundingPlan field | Notes |
|---------------|-------------------|-------|
| `name` | `name` | Direct |
| `description` | `description` | Direct |
| `amount.valueInCents` | `amount` | Already in cents (matches our convention) |
| `amount.currency` | `currency` | Direct |
| `interval` (month/year/flexible) | `frequency` | Map `flexible` → `other` |
| `slug` | `guid` | Use as stable identifier |

This means a steward who sets up an OC collective with tiers gets rich plan
cards on at.fund **automatically** — no fund.at record setup needed.

**Implementation path:**
- New `lib/oc-enrichment.ts` module
- Called during funding resolution when `detectPlatform(contributeUrl) === 'open-collective'`
- Cache responses (tiers don't change often — 1hr TTL is fine)
- Graceful degradation: if API is down, fall back to current dumb-link behavior

#### 1b. Financial health badge

Query `stats` to display on the card:

- **Backer count** — "42 backers" gives social proof
- **Yearly budget** — signals sustainability
- **Fiscal host** — "via Open Source Collective" builds trust

These are small UI additions to `StewardCard` but provide meaningful signal
about a project's funding health.

#### 1c. Collective profile backfill

If a steward has an OC collective but no ATProto profile data (no avatar, no
description), use OC's `imageUrl` and `description` as fallbacks. This helps
for projects that exist primarily on OC but are just starting on ATProto.

---

### Tier 2: Smart Contribution Links (medium effort)

**Goal:** Replace dumb "Open Collective" buttons with contextual, pre-filled
contribution links.

#### 2a. Tier-specific deep links

Instead of linking to `opencollective.com/blacksky`, link directly to a
specific tier's checkout:

```
https://opencollective.com/blacksky/contribute/supporter-12345/checkout
```

Each plan button on the card links to its corresponding OC tier. This skips
the OC landing page and goes straight to payment.

**Implementation:** Construct the URL from the tier slug + legacy ID fetched in
Tier 1a. Store as the channel `address` on synthesized FundingChannel records.

#### 2b. Pre-filled amounts from fund.at plans

When a steward has both fund.at plans (with custom amounts) and an OC channel,
construct deep-linked URLs:

```
https://opencollective.com/{slug}/donate?amount={plan.amount/100}&interval={freq}
```

This bridges the steward's self-described funding preferences with OC's
checkout flow. The steward defines tiers in their ATProto repo; at.fund
constructs the OC checkout URL to match.

#### 2c. Embeddable checkout (modal)

For the `/give` page, instead of opening OC in a new tab, embed the
contribution flow in a modal:

```html
<iframe src="https://opencollective.com/embed/{slug}/donate"
        style="width: 100%; min-height: 80vh;"></iframe>
```

This keeps the user in the at.fund flow. They can contribute and return to
scanning their next dependency without context-switching.

**Consideration:** This requires OC's embed to work in cross-origin iframes,
and the UX needs thought around post-contribution state (how does at.fund know
the contribution succeeded?). OC supports a `redirect` parameter for
post-donation redirects that could route back to at.fund.

---

### Tier 3: Dependency-Aware Funding (high effort, high impact)

**Goal:** Use at.fund's dependency graph + social signals to help users fund
their entire stack through OC.

This is where at.fund's unique qualities (ATProto dependency graph, network
endorsements, transitive resolution) combine with OC's unique qualities (fiscal
hosting, collective-to-collective transfers, ecosystem funds) to create
something neither can do alone.

#### 3a. "Fund My Stack" via OC

After a scan, at.fund knows the user's full dependency tree and which deps have
OC collectives. Present a "Fund my stack" action that:

1. Filters discovered entries to those with `detectPlatform === 'open-collective'`
2. Shows the list with suggested allocation (see 3c for weighting)
3. Generates individual contribution links for each, OR
4. If the user has their own OC collective on the same fiscal host, uses
   collective-to-collective transfers

**The key insight:** at.fund already does the hard work of discovering *which*
projects a user depends on. OC already does the hard work of *moving money*.
The gap is connecting the two — at.fund's dep graph becomes OC's distribution
guide.

#### 3b. Collective-to-collective for ATProto projects

If both the contributor and the steward are on the same fiscal host (likely Open
Source Collective for ATProto projects), contributions can flow as internal
balance transfers — no payment processor fees, instant settlement.

at.fund could detect this case:
1. User's OC collective is on fiscal host X
2. Target steward's OC collective is also on fiscal host X
3. Offer "Fund from your collective balance" as a zero-fee option

This requires authenticated OC API access (the user would need to connect their
OC account), but it's the most efficient path for project-to-project funding.

#### 3c. Endorsement-weighted allocation

at.fund's endorsement data provides a *social signal* that OC lacks. When
distributing funds across deps, weight by:

- **Endorsement count from the user's network** — if 20 of your follows
  endorse Project A vs 2 for Project B, weight accordingly
- **Dependency depth** — direct deps weighted higher than transitive
- **Funding gap** — projects with fewer backers or lower yearly budget need
  more support (query OC stats to determine this)

This produces a suggested allocation like:

```
Your ATProto Stack — Suggested Monthly: $25
  Blacksky         $8/mo  (18 endorsements, 12 backers)
  Smoke Signal     $6/mo  (11 endorsements, 5 backers)
  Bridgy Fed       $5/mo  (9 endorsements, 45 backers)
  AT Protocol Dev  $4/mo  (7 endorsements, 89 backers)
  weDistribute     $2/mo  (3 endorsements, 8 backers)
```

The user adjusts and confirms. at.fund generates the contribution links (or
uses OC API mutations if authenticated).

#### 3d. Bridge to Ecosystem Funds

OC's Ecosystem Funds (via ecosyste.ms) already distribute money to language
ecosystems. at.fund could:

- Recognize when a discovered dep is part of an Ecosystem Fund
- Show "Also funded via the {X} Ecosystem Fund" on the card
- Allow users to contribute to the Ecosystem Fund as a way to support their
  broader dep tree
- Contribute at.fund's ATProto-specific dependency data to ecosyste.ms for
  the AT Protocol ecosystem fund

---

### Tier 4: ATProto x OC Identity Bridge (aspirational)

**Goal:** Create a bidirectional identity link between ATProto DIDs and OC
accounts, enabling new trust and transparency patterns.

#### 4a. OC account verification via ATProto

A steward could prove they control an OC collective by publishing a
`fund.at.funding.channel` record with an OC URI, then placing their DID in the
OC collective's description or long description field. at.fund verifies the
bidirectional claim.

This is analogous to domain-handle verification in ATProto but for funding
platforms. It proves "this ATProto account controls this OC collective" with
cryptographic backing.

#### 4b. Contribution attestations

When a user contributes through an OC link generated by at.fund, the app could
create an attestation record:

```
fund.at.graph.contribution (hypothetical)
  subject: did:plc:steward   # who received
  platform: "open-collective"
  amount: 500                 # cents
  frequency: "monthly"
  createdAt: datetime
```

This is self-reported (not verified by OC), but it enables:
- "You're already supporting 3 of your deps" messaging
- Social proof: "5 people in your network fund this project"
- Contribution streaks / engagement signals

Verification could come later via OC's authenticated API (confirming the
contribution exists in OC's transaction log).

#### 4c. OC OAuth integration

OC supports OAuth. A steward could connect their OC account to at.fund,
enabling:

- **Automatic fund.at record generation** from their OC collective's tiers and
  payment methods — zero-config setup
- **Live financial data** on their profile (total raised, recent contributions)
- **Authenticated contribution flows** where the user's OC identity is
  pre-filled

---

## Synthesis: What Makes This Unique

The table below compares at.fund + OC integration against existing alternatives:

| Capability | Back Your Stack | StackAid | npm fund | **at.fund + OC** |
|------------|----------------|----------|----------|-----------------|
| Dependency discovery | Package manager only | Package manager only | Package manifest | ATProto social graph + repos + feeds + labelers |
| Social signal | None | None | None | Network endorsements, follow graph |
| Funding platforms | OC only | Stripe only | Any URL | Any URL + deep OC integration |
| Distribution model | Manual per-dep | Automatic % split | N/A (just links) | Endorsement-weighted + gap-aware |
| Identity model | GitHub | GitHub | npm | ATProto DID (portable, self-sovereign) |
| Dep types | Libraries | Libraries | Libraries | Libraries + feeds + labelers + PDS hosts + tools |
| Collective-to-collective | No | No | No | Yes (same fiscal host) |
| Recurring support | One-time bulk | Subscription | N/A | Per-dep subscriptions via OC tiers |

The unique value proposition is the combination of:

1. **ATProto's social graph** for discovery and trust signals (no other system has this)
2. **OC's fiscal infrastructure** for actually moving money (proven, legal, transparent)
3. **Endorsement-weighted distribution** that accounts for network trust, not just dependency depth
4. **Multi-type dependencies** — not just npm packages, but feeds, labelers, PDS hosts, and protocol-level tools

## Recommended Phasing

| Phase | Effort | Impact | Prerequisite |
|-------|--------|--------|-------------|
| **1a: Auto-import OC tiers** | Low | Medium | OC API key (free) |
| **1b: Financial health badge** | Low | Low-Medium | Same API key |
| **2a: Tier deep links** | Low | Medium | Tier 1a data |
| **2b: Pre-filled contribution URLs** | Low | Medium | None |
| **3a: Fund My Stack** | Medium | High | Tier 1a + UI work |
| **3c: Endorsement-weighted allocation** | Medium | High | Tier 3a + algorithm design |
| **2c: Embedded checkout** | Medium | Medium | OC embed testing |
| **3b: Collective-to-collective** | High | High | OC authenticated API |
| **3d: Ecosystem Funds bridge** | Medium | Medium | ecosyste.ms relationship |
| **4a-c: Identity bridge** | High | High | OC OAuth + new lexicons |

Start with **1a + 2a + 2b** — they're low-effort changes that make every
OC-backed card immediately more useful. Then build toward **3a + 3c** as the
flagship feature: "at.fund tells you who to fund; OC makes it happen."

## Open Questions

1. **Rate limits:** At 10 req/min unauthenticated, can we enrich OC data
   during a scan pipeline without hitting limits? A scan might discover 5-10 OC
   collectives. With caching, this should be fine. For authenticated (100/min),
   definitely fine.

2. **Latency:** GraphQL queries add latency to card enrichment. Should OC
   enrichment happen eagerly in the pipeline (blocking card render) or lazily
   (cards appear, then backfill OC data)?

3. **Caching strategy:** OC tier data changes infrequently — 1hr or even 24hr
   cache TTL is reasonable. Stats (backer count, budget) could be cached
   shorter (1hr). Where to cache: in-memory per-process (like fund.at prefetch)
   or external (Redis)?

4. **Privacy:** When showing "X people in your network fund this project" (Tier
   4b), is this a privacy concern? Contributions on OC are public by default,
   but correlating OC contributions with ATProto identities adds a new
   dimension.

5. **OC API stability:** The GraphQL API v2 is marked as a preview. How stable
   is it? Breaking changes would affect tier import. Mitigation: defensive
   parsing (lenient reader), same as we do for fund.at records and funding.json.

6. **Fiscal host diversity:** The collective-to-collective optimization (Tier
   3b) assumes both parties are on the same fiscal host. For the ATProto
   ecosystem, this is likely true today (most would use Open Source Collective),
   but may not hold as the ecosystem diversifies.

## Architectural Fit

The OC integration slots cleanly into at.fund's existing architecture:

- **OC enrichment** becomes a new step in the funding resolution chain
  (`fund.at records → OC API → manual catalog → unknown`), or more precisely,
  an enrichment pass *after* the primary resolution that augments existing
  Funding data with OC-sourced tiers and stats
- **OC-specific data** can extend the `Funding` type with optional
  `ocCollective?: { slug, backerCount, yearlyBudget, host }` without breaking
  existing consumers
- **ScanContext** can carry an OC prefetch map alongside the existing fund.at
  prefetch map, following the same bounded-concurrency pattern
- **The card component** gains OC-aware rendering in `FundingChannelsSection`
  (show backer count, tier deep links) without structural changes

No new lexicons are needed for Tiers 1-3. The existing `fund.at.funding.channel`
with an OC URL is the only record that matters. All enrichment is server-side
API calls, invisible to the ATProto layer.
