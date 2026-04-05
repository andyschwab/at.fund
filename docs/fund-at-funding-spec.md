# at.fund Funding Specification

> A derivative specification for decentralized funding metadata on the
> AT Protocol, honoring the lineage of prior art in web-native funding signals.

**Version:** 0.1.0 (draft)
**Date:** 2026-04-05
**Status:** Working draft

Note: The lexicon namespace `fund.at.*` follows ATProto's reverse-DNS
convention (TLD first). The product is **at.fund**.

---

## 1. Prior Art and Lineage

at.fund does not exist in isolation. It inherits from a decades-long lineage of
web-native funding signals, each building on the last:

| Year | Standard | What it introduced |
|------|----------|--------------------|
| 2002 | `rel="payment"` (IANA registered 2005) | The foundational link relation: "here is where you can pay the author of this content." A single `<link>` or `<a>` tag. Proposed by Eric Meyer and Tantek Çelik as part of the microformats movement. |
| 2019 | GitHub `FUNDING.yml` | Platform-specific structured funding for repositories. Introduced the concept of named platform slots (github, patreon, ko_fi, etc.) with a `custom` escape hatch. |
| 2019 | npm `funding` field | Package-level funding metadata in `package.json`. Made funding discoverable via dependency trees (`npm fund`). First standard to connect funding to the dependency graph. |
| 2020 | Podcasting 2.0 `<podcast:funding>` | RSS namespace extension for podcast feeds. Brought `url` + `label` semantics to audio content — directly echoing `rel="payment"` but for syndicated media. |
| 2024 | funding.json (fundingjson.org) | Comprehensive machine-readable standard for FOSS projects. Entity metadata, typed payment channels, tiered plans, financial history. The most complete expression of structured funding metadata to date. |
| 2025 | at.fund | ATProto-native funding layer. Combines structured metadata with cryptographic identity provenance and social graph context. This specification. |

### What each layer contributes

```
rel="payment"         →  "Support this content" (the primitive signal)
GitHub FUNDING.yml    →  "Support this project, via these platforms"
npm funding           →  "Support this dependency" (graph-aware)
podcast:funding       →  "Support this feed" (syndicated, labeled)
funding.json          →  "Support this entity" (structured, multi-channel)
at.fund               →  "Support this entity" (signed, social, graph-aware)
```

at.fund's unique contributions beyond prior art:
- **Cryptographic provenance** — records are DID-signed, not just DNS-verified
- **Social context** — endorsements from your network surface relevance
- **Dependency awareness** — transitive dependency scanning, not just direct
- **Protocol-native** — records live in the user's ATProto repository, not a
  separate file or platform
- **Cross-account references** — plans can point to channels in any account,
  enabling shared payment infrastructure for teams

## 2. Architecture: Three Layers

at.fund operates as a three-layer system. Each layer is independent and
optional; higher layers provide progressive enhancement.

```
Layer 1: Contribute     →  "Here is my funding page"
Layer 2: Channels+Plans →  "Here are my payment endpoints and tiers"
Layer 3: Social Graph   →  "Here is who endorses and depends on me"
```

Any combination is valid: just social signal (declaration only), just a
contribute link, channels without a contribute link, or the full stack.

### Layer 1: Contribute

**Lexicon:** `fund.at.funding.contribute`
**Key:** `literal:self` (singleton per account)
**Inspiration:** `rel="payment"`, `podcast:funding`

The simplest possible funding signal — a single URL pointing to where
contributions can be made. This is the ATProto equivalent of:

```html
<link rel="payment" href="https://example.com/donate" title="Support us" />
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | uri | Yes | The canonical funding page URL |
| `label` | string (≤128) | No | Human-readable description (inspired by `rel="payment"` title attribute and `podcast:funding` text content) |
| `createdAt` | datetime | No | When this record was created or last updated |

**Design principle:** The contribute URL is unopinionated. It may point to
GitHub Sponsors, a Stripe checkout, a Ko-fi page, or a hand-coded HTML page.
at.fund renders the link; the user clicks through. No intermediation.

**Relationship to channels:** Contribute and channels serve different semantic
roles. Contribute answers "what's the one link I put on a card?" — it's the
`rel="payment"` primitive for consumers. Channels answer "what are my actual
payment endpoints?" — they're structured data for clients that render rich UIs.
A contribute URL is often a landing page that itself contains multiple channels.

### Layer 2: Channels and Plans (optional enrichment)

Structured payment metadata: channels where contributions can flow, and plans
(tiers) that suggest amounts and frequencies. This is the ATProto-native
equivalent of the `funding` section in a funding.json file.

Unlike prior approaches that embed channels and plans in a single manifest
record, at.fund stores each as an individual record. This enables:
- Independent create/update/delete for each channel and plan
- Individual addressability via AT URI
- Cross-account references (a plan in one account can point to a channel in
  another account)

#### Channel (`fund.at.funding.channel`)

**Key:** `any` (rkey = slug like `github-sponsors`, `open-collective`)

A single payment channel — a specific place where contributions can be received.

| Field | Type | Required | Maps to funding.json |
|-------|------|----------|---------------------|
| `channelType` | string (≤32) | Yes | `channel.type` |
| `uri` | uri | No | `channel.address` |
| `description` | string (≤500) | No | `channel.description` |
| `createdAt` | datetime | No | — |

**`channelType` known values:** `payment-provider`, `bank`, `cheque`, `cash`, `other`

Note: `uri` is optional because some channel types (bank transfers, cheques)
have no public URL. The record key (rkey) serves as the channel's identifier,
equivalent to funding.json's `channel.guid`.

#### Plan (`fund.at.funding.plan`)

**Key:** `any` (rkey = slug like `supporter`, `sustainer`)

A funding plan or tier with a suggested contribution level.

| Field | Type | Required | Maps to funding.json |
|-------|------|----------|---------------------|
| `status` | string (≤16) | No | `plan.status` |
| `name` | string (≤128) | Yes | `plan.name` |
| `description` | string (≤500) | No | `plan.description` |
| `amount` | integer | No | `plan.amount` (×100) |
| `currency` | string (≤3) | No | `plan.currency` |
| `frequency` | string (���16) | No | `plan.frequency` |
| `channels` | at-uri[] | No | `plan.channels` |
| `createdAt` | datetime | No | — |

**`status` known values:** `active`, `inactive`
**`frequency` known values:** `one-time`, `weekly`, `fortnightly`, `monthly`, `yearly`, `other`

**Currency convention:** Amounts are stored in the smallest currency unit
(e.g. cents for USD, pence for GBP). This avoids floating-point ambiguity
in a protocol context. When converting from funding.json (which uses whole
units), multiply by 100.

**Cross-account channel references:** The `channels` field takes AT URIs,
not local IDs. A plan's channels may reference `fund.at.funding.channel`
records in *any* account. This enables a team of maintainers to each publish
their own plans while pointing to a shared organizational payment channel:

```
at://did:plc:maintainer-a/fund.at.funding.plan/supporter
  → channels: [at://did:plc:org/fund.at.funding.channel/open-collective]

at://did:plc:maintainer-b/fund.at.funding.plan/supporter
  → channels: [at://did:plc:org/fund.at.funding.channel/open-collective]
```

If `channels` is omitted, all of the account's own channels apply.

### Layer 3: Social Graph (novel to at.fund)

**Lexicons:** `fund.at.graph.endorse`, `fund.at.graph.dependency`

These records have no equivalent in prior art. They create a social funding
graph on top of the ATProto social graph:

- **Endorsements** — "I vouch for this entity's work." Allows at.fund to
  surface entries that your network trusts.
- **Dependencies** — "My work depends on this entity." Enables transitive
  dependency scanning ("you use Feed X, which depends on Library Y").

### Identity Layer

**Lexicon:** `fund.at.actor.declaration`
**Key:** `literal:self` (singleton)

A participation signal — its existence means "this account is part of the
at.fund ecosystem." All fields are optional enrichment.

| Field | Type | Required | Maps to funding.json |
|-------|------|----------|---------------------|
| `entityType` | string (≤32) | No | `entity.type` |
| `role` | string (≤32) | No | `entity.role` |
| `createdAt` | datetime | No | — |

**`entityType` known values:** `individual`, `group`, `collective`, `organisation`, `other`
**`role` known values:** `owner`, `steward`, `maintainer`, `contributor`, `sponsor`, `other`

## 3. Namespace Organization

Records are organized into three namespace groups:

```
fund.at.actor.*      Identity and participation signals
  .declaration       "I exist in the at.fund ecosystem"

fund.at.funding.*    Payment and financial metadata
  .contribute        "Here is my funding page" (the primitive signal)
  .channel           "Here is a payment endpoint" (individual record per channel)
  .plan              "Here is a funding tier" (individual record per plan)

fund.at.graph.*      Social relationships
  .endorse           "I endorse this entity"
  .dependency        "I depend on this entity"
```

## 4. funding.json Compatibility

at.fund aims for **round-trip fidelity** with funding.json v1.x. A steward's
funding.json can be converted to at.fund records and back without information
loss for the fields at.fund supports.

### Conversion: funding.json → at.fund records

| funding.json field | at.fund record | Notes |
|---|---|---|
| `entity.type` | `fund.at.actor.declaration.entityType` | Direct mapping |
| `entity.role` | `fund.at.actor.declaration.role` | Direct mapping |
| `funding.channels[]` | `fund.at.funding.channel` records | One record per channel; `guid`→rkey, `type`→`channelType`, `address`→`uri` |
| `funding.plans[]` | `fund.at.funding.plan` records | One record per plan; `guid`→rkey, `amount`×100, `channels` as AT URIs |

### Fields at.fund does not map

The following funding.json fields have no at.fund equivalent. They are
intentionally omitted because they duplicate information available elsewhere
in the ATProto ecosystem:

| funding.json field | Why omitted |
|---|---|
| `entity.name` | Available from the ATProto profile (`app.bsky.actor.profile`) |
| `entity.email` | Privacy concern; not appropriate for a public record |
| `entity.phone` | Privacy concern |
| `entity.description` | Available from the ATProto profile |
| `entity.webpageUrl` | Derivable from the DID document (`alsoKnownAs`) |
| `projects[]` | Out of scope — at.fund is per-account, not per-project |

### History (not implemented)

funding.json includes a `funding.history[]` section for annual financial
transparency (income, expenses, taxes). at.fund does not currently implement
history records. Self-reported financial data without verification or
attestation has limited value in a protocol context. This may be revisited
in the future if paired with provenance mechanisms (e.g. third-party
attestations, on-chain payment proofs).

### knownValues, not enums

All string fields with constrained vocabularies use ATProto's `knownValues`
pattern rather than closed enums. This means:

- Existing values are documented and standardized
- New values can be added without breaking existing clients
- Clients should handle unknown values gracefully (display as-is or fall back)

This aligns with ATProto's extensibility philosophy and avoids the brittleness
of closed enums in a decentralized protocol.

## 5. Design Principles

### 1. Signal, not platform

at.fund publishes metadata. It never intermediates payments, never holds funds,
never takes a commission. The `contribute` URL and channel URIs link to external
platforms where the actual transaction happens.

### 2. Progressive enhancement

Each layer is optional. A steward with just a declaration gets discovered. A
steward with a contribute URL gets a card with a button. A steward with channels
and plans gets richer cards. Nothing breaks when layers are absent.

### 3. Individual records, not monoliths

Each channel and plan is its own record, individually addressable by AT URI.
This enables fine-grained updates, cross-account references, and natural
protocol-level operations (list, get, put, delete). Prior approaches (embedded
arrays in a manifest record) created coupling that made partial updates awkward.

### 4. Steward sovereignty

The steward's PDS repository is the source of truth. at.fund reads from it but
never writes to it (except during explicit user-initiated setup). Records are
DID-signed, giving cryptographic proof of authorship that DNS-based systems
(funding.json's `.well-known` discovery) cannot provide.

### 5. Lenient reader, strict writer

at.fund reads funding data leniently — if a field parses, we use it. We do not
validate records with unknown fields. But our setup flow writes records
strictly, producing well-formed data that other consumers can rely on.

### 6. Social context is the differentiator

The prior art lineage shows a clear progression: from a simple link
(`rel="payment"`), to structured metadata (funding.json), to what at.fund
adds — social context. "12 people you follow endorse this project" is
information no static file can provide.

## 6. Acknowledgements

This specification builds on the work of:

- **Eric Meyer and Tantek Çelik** — `rel="payment"` (2002), the foundational
  web funding signal
- **GitHub** — `FUNDING.yml` (2019), platform-aware funding metadata
- **npm** — `funding` field (2019), dependency-graph-aware funding
- **Podcasting 2.0 / Adam Curry and Dave Jones** — `<podcast:funding>` (2020),
  syndicated funding signals
- **FLOSS/fund and the funding.json community** — funding.json (2024), the most
  comprehensive machine-readable funding standard
- **The ATProto team at Bluesky** — the protocol that makes decentralized,
  cryptographically-signed records possible
