# fund.at Funding Specification

> A derivative specification for decentralized funding metadata on the
> AT Protocol, honoring the lineage of prior art in web-native funding signals.

**Version:** 0.1.0 (draft)
**Date:** 2026-04-05
**Status:** Working draft

---

## 1. Prior Art and Lineage

fund.at does not exist in isolation. It inherits from a decades-long lineage of
web-native funding signals, each building on the last:

| Year | Standard | What it introduced |
|------|----------|--------------------|
| 2002 | `rel="payment"` (IANA registered 2005) | The foundational link relation: "here is where you can pay the author of this content." A single `<link>` or `<a>` tag. Proposed by Eric Meyer and Tantek Çelik as part of the microformats movement. |
| 2019 | GitHub `FUNDING.yml` | Platform-specific structured funding for repositories. Introduced the concept of named platform slots (github, patreon, ko_fi, etc.) with a `custom` escape hatch. |
| 2019 | npm `funding` field | Package-level funding metadata in `package.json`. Made funding discoverable via dependency trees (`npm fund`). First standard to connect funding to the dependency graph. |
| 2020 | Podcasting 2.0 `<podcast:funding>` | RSS namespace extension for podcast feeds. Brought `url` + `label` semantics to audio content — directly echoing `rel="payment"` but for syndicated media. |
| 2024 | funding.json (fundingjson.org) | Comprehensive machine-readable standard for FOSS projects. Entity metadata, typed payment channels, tiered plans, financial history. The most complete expression of structured funding metadata to date. |
| 2025 | fund.at | ATProto-native funding layer. Combines structured metadata with cryptographic identity provenance and social graph context. This specification. |

### What each layer contributes

```
rel="payment"         →  "Support this content" (the primitive signal)
GitHub FUNDING.yml    →  "Support this project, via these platforms"
npm funding           →  "Support this dependency" (graph-aware)
podcast:funding       →  "Support this feed" (syndicated, labeled)
funding.json          →  "Support this entity" (structured, multi-channel)
fund.at               →  "Support this entity" (signed, social, graph-aware)
```

fund.at's unique contributions beyond prior art:
- **Cryptographic provenance** — records are DID-signed, not just DNS-verified
- **Social context** — endorsements from your network surface relevance
- **Dependency awareness** — transitive dependency scanning, not just direct
- **Protocol-native** — records live in the user's ATProto repository, not a
  separate file or platform

## 2. Architecture: Three Layers

fund.at operates as a three-layer system. Each layer is independent; higher
layers provide progressive enhancement.

```
Layer 1: Contribute     →  "Here is my funding page"
Layer 2: Manifest       →  "Here are my payment channels and plans"
Layer 3: Social Graph   →  "Here is who endorses and depends on me"
```

### Layer 1: Contribute (required)

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
fund.at renders the link; the user clicks through. No intermediation.

### Layer 2: Manifest (optional enrichment)

**Lexicon:** `fund.at.funding.manifest`
**Key:** `literal:self` (singleton per account)
**Inspiration:** funding.json

Structured payment metadata: channels where contributions can flow, and plans
(tiers) that suggest amounts and frequencies. This is the ATProto equivalent
of the `funding` section in a funding.json file.

The manifest uses shared definitions from `fund.at.funding.defs`:

#### Channel (`fund.at.funding.defs#channel`)

A single payment channel. Maps to a funding.json `channel` entry.

| Field | Type | Required | Maps to funding.json |
|-------|------|----------|---------------------|
| `channelId` | string (≤32) | Yes | `channel.guid` |
| `channelType` | string (≤32) | No | `channel.type` |
| `uri` | uri | No | `channel.address` |
| `description` | string (≤500) | No | `channel.description` |

**`channelType` known values:** `payment-provider`, `bank`, `cheque`, `cash`, `other`

Note: `uri` is optional because some channel types (bank transfers, cheques)
have no public URL. This differs from funding.json where `address` is required.

#### Plan (`fund.at.funding.defs#plan`)

A funding plan or tier. Maps to a funding.json `plan` entry.

| Field | Type | Required | Maps to funding.json |
|-------|------|----------|---------------------|
| `planId` | string (≤32) | Yes | `plan.guid` |
| `status` | string (≤16) | No | `plan.status` |
| `name` | string (≤128) | Yes | `plan.name` |
| `description` | string (≤500) | No | `plan.description` |
| `amount` | integer | No | `plan.amount` (×100) |
| `currency` | string (≤3) | No | `plan.currency` |
| `frequency` | string (≤16) | No | `plan.frequency` |
| `channels` | channelRef[] | No | `plan.channels` |

**`status` known values:** `active`, `inactive`
**`frequency` known values:** `one-time`, `weekly`, `fortnightly`, `monthly`, `yearly`, `other`

**Currency convention:** Amounts are stored in the smallest currency unit
(e.g. cents for USD, pence for GBP). This avoids floating-point ambiguity
in a protocol context. When converting from funding.json (which uses whole
units), multiply by 100.

### Layer 2b: History (optional enrichment)

**Lexicon:** `fund.at.funding.history`
**Key:** `any` (one record per year, rkey is the year string)
**Inspiration:** funding.json `funding.history`

Annual financial transparency records. Each record covers one calendar year.

| Field | Type | Required | Maps to funding.json |
|-------|------|----------|---------------------|
| `year` | integer | Yes | `history[].year` |
| `income` | integer | No | `history[].income` (×100) |
| `expenses` | integer | No | `history[].expenses` (×100) |
| `taxes` | integer | No | `history[].taxes` (×100) |
| `currency` | string (≤3) | No | `history[].currency` |
| `description` | string (≤500) | No | `history[].description` |
| `createdAt` | datetime | No | — |

History records are individually addressable via `com.atproto.repo.listRecords`,
making them suitable for incremental updates and historical queries.

### Layer 3: Social Graph (novel to fund.at)

**Lexicons:** `fund.at.graph.endorse`, `fund.at.graph.dependency`

These records have no equivalent in prior art. They create a social funding
graph on top of the ATProto social graph:

- **Endorsements** — "I vouch for this entity's work." Allows fund.at to
  surface entries that your network trusts.
- **Dependencies** — "My work depends on this entity." Enables transitive
  dependency scanning ("you use Feed X, which depends on Library Y").

### Identity Layer

**Lexicon:** `fund.at.actor.declaration`
**Key:** `literal:self` (singleton)

A participation signal — its existence means "this account is part of the
fund.at ecosystem." All fields are optional enrichment.

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
  .declaration       "I exist in the fund.at ecosystem"

fund.at.funding.*    Payment and financial metadata
  .contribute        "Here is my funding page" (the primitive signal)
  .manifest          "Here are my channels and plans"
  .history           "Here is my financial history"
  .defs              Shared type definitions (channel, plan, channelRef)

fund.at.graph.*      Social relationships
  .endorse           "I endorse this entity"
  .dependency        "I depend on this entity"
```

## 4. funding.json Compatibility

fund.at aims for **round-trip fidelity** with funding.json v1.x. A steward's
funding.json can be converted to fund.at records and back without information
loss for the fields fund.at supports.

### Conversion: funding.json → fund.at records

| funding.json field | fund.at record | Notes |
|---|---|---|
| `entity.type` | `fund.at.actor.declaration.entityType` | Direct mapping |
| `entity.role` | `fund.at.actor.declaration.role` | Direct mapping |
| `funding.channels[]` | `fund.at.funding.manifest.channels[]` | `guid`→`channelId`, `type`→`channelType`, `address`→`uri` |
| `funding.plans[]` | `fund.at.funding.manifest.plans[]` | `guid`→`planId`, `amount`×100, `channels` wrapped in `channelRef` objects |
| `funding.history[]` | `fund.at.funding.history` records | One record per year, amounts ×100 |

### Fields fund.at does not map

The following funding.json fields have no fund.at equivalent. They are
intentionally omitted because they duplicate information available elsewhere
in the ATProto ecosystem:

| funding.json field | Why omitted |
|---|---|
| `entity.name` | Available from the ATProto profile (`app.bsky.actor.profile`) |
| `entity.email` | Privacy concern; not appropriate for a public record |
| `entity.phone` | Privacy concern |
| `entity.description` | Available from the ATProto profile |
| `entity.webpageUrl` | Derivable from the DID document (`alsoKnownAs`) |
| `projects[]` | Out of scope — fund.at is per-account, not per-project |

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

fund.at publishes metadata. It never intermediates payments, never holds funds,
never takes a commission. The `contribute` URL and channel URIs link to external
platforms where the actual transaction happens.

### 2. Progressive enhancement

Each layer is optional beyond Layer 1 (contribute). A steward with just a
contribute URL gets a card. A steward with a manifest gets richer cards. A
steward with history gets transparency indicators. Nothing breaks when layers
are absent.

### 3. Steward sovereignty

The steward's PDS repository is the source of truth. fund.at reads from it but
never writes to it (except during explicit user-initiated setup). Records are
DID-signed, giving cryptographic proof of authorship that DNS-based systems
(funding.json's `.well-known` discovery) cannot provide.

### 4. Lenient reader, strict writer

fund.at reads funding data leniently — if a field parses, we use it. We do not
validate manifests or reject records with unknown fields. But our setup flow
writes records strictly, producing well-formed data that other consumers can
rely on.

### 5. Social context is the differentiator

The prior art lineage shows a clear progression: from a simple link
(`rel="payment"`), to structured metadata (funding.json), to what fund.at
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
