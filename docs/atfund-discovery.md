# Domain/DID discovery for `fund.at.*`

This describes how clients discover **canonical disclosure, contribution links, and dependency metadata** published on ATProto (`fund.at.disclosure`, optional `fund.at.contribute`, optional `fund.at.dependencies`).

Discovery works from either a **DID** (query directly) or a **hostname** (resolve the hostname’s DID via ATProto’s `_atproto` TXT).

## Inputs

- **DID**: `did:plc:…` or `did:web:…`
- **Hostname**: `example.com`, `pds.example.com`

## Hostname → DID

- **Primary:** DNS TXT `_atproto.<hostname>`
- **Fallback:** `https://<hostname>/.well-known/atproto-did`
- DNS value is commonly `did=did:plc:…`, but clients should also accept a bare DID.

```text
_atproto.pds.example.com  TXT  "did=did:plc:xxxxxxxxxxxxxxxxxxxx"
```

```text
GET https://example.com/.well-known/atproto-did
did:plc:xxxxxxxxxxxxxxxxxxxx
```

## Resolution (conceptual)

1. Start with an identifier \(DID or hostname\).
2. If it’s a hostname, resolve it to DID via DNS `_atproto` and/or HTTPS well-known.
3. Resolve the DID to its PDS, then `com.atproto.repo.listRecords` on:
   - **required**: `fund.at.disclosure`
   - **optional**: `fund.at.contribute`
   - **optional**: `fund.at.dependencies`

## Record scoping

- **`restrictToDomains`** (`fund.at.contribute`, `fund.at.disclosure`, `fund.at.dependencies`) — optional allowlist of hostnames for which a record should be considered applicable. When omitted or empty, the record is open.
- **`appliesToNsidPrefix`** (`fund.at.dependencies` only) — optional NSID prefix for tool-scoped dependency lists. Host-only clients (e.g. PDS hostname lookup) may ignore records that set this field.

This app uses the lookup hostname (currently: the user’s home PDS hostname from DID document service discovery) when evaluating allowlists.

When multiple records match, this app picks the **`fund.at.disclosure`** row with the newest **`effectiveDate`** that still has usable meta, and the newest **`fund.at.contribute`** row that has usable links (if any). It merges dependency **URIs** from all matching host-scoped **`fund.at.dependencies`** records (deduplicated).

## This app

After sign-in, the app resolves the user DID to a DID document, extracts the home PDS URL, resolves steward identity from hostname (DNS `_atproto` plus HTTPS well-known fallback), and shows a **Your host** section.

## Acknowledgement signals for out-of-band contributions

This section proposes how `fund.at` could model contribution acknowledgement when actual payment or transfer happens outside ATProto.

### Context

`fund.at.contribute` currently publishes contribution entry points (links and metadata), not contribution events.

For event-like interactions, `fund.at` can use an ATProto-native edge-record pattern (similar to likes/replies): one record references another subject, records carry timestamp plus optional context, and indexers can build participant activity/state without controlling payment rails.

### Goals

- Preserve the out-of-band funding model (no settlement logic in protocol)
- Enable useful social and coordination signals: interest, activity, acknowledgement, status
- Support both donor-participatory and recipient-only automation workflows
- Keep privacy and abuse resistance as first-class concerns

### Proposed record model

#### 1) `fund.at.contribute.signal` (contributor-authored, optional)

Contributor indicates intent or a claim of contribution.

Possible fields:

- `recipient` (DID)
- `kind` (`interest | pledge | sent`)
- `channel` (optional processor/provider label)
- `createdAt`
- optional `evidence` (URL or hashed external identifier)
- optional `amountBand` (coarse buckets only)

#### 2) `fund.at.contribute.ack` (recipient-authored)

Recipient acknowledges a contribution signal or external contribution event.

Possible fields:

- `ackType` (`in-response | recipient-initiated`)
- `createdAt`
- `status` (`acknowledged | verified | needs-info | declined | corrected | revoked | spam`)
- optional `note`
- optional `impactRef` / `fulfillmentRef` (release note, changelog, sponsor page)

##### Dual-mode behavior

**Mode A: signal-linked acknowledgement**

- includes `subject` (`com.atproto.repo.strongRef`) pointing to `fund.at.contribute.signal`
- strongest evidence class (donor-participatory)

**Mode B: recipient-initiated acknowledgement**

- no `subject`
- includes `externalRef` metadata (provider + hashed provider event identifier + optional occurred window)
- supports automated acknowledgement when donor never used `fund.at`
- weaker evidence class; should be rendered distinctly in clients

### Why allow ack without signal

Some contributors will give through external channels and never publish any ATProto signal. A recipient may still want to publish transparent acknowledgement events (manually or via automation).

Allowing recipient-initiated ack:

- avoids excluding non-ATProto donor workflows
- enables aggregate transparency and activity feeds
- preserves utility even with partial donor participation

### Trust and UX considerations

#### Evidence tiers

Clients/indexers should distinguish:

1. `ack` with `subject` -> donor-participatory edge
2. `ack` without `subject` but with `externalRef` -> recipient claim with external traceability
3. `ack` without either -> weak claim; de-emphasize in UI

#### Identity confidence

For recipient-initiated acks, benefactor identity may be partial or uncertain.

Consider:

- optional `benefactor` object (DID/handle/hash/anonymous marker)
- optional `identityConfidence` (`high | medium | low | unknown`)

#### Privacy and consent

Do not require exact amount or raw payment IDs.

Prefer:

- coarse amount bands
- hashed external identifiers
- optional visibility policy and recognition opt-out semantics

#### Abuse and misattribution

Recipient-initiated acks can be abused for self-promotion or false attribution.

Mitigations:

- explicit semantics in lexicon/docs: recipient-initiated ack is a recipient claim, not donor confirmation
- optional `verificationMethod` and `evidenceUri`
- lifecycle statuses (`corrected`, `revoked`) for post-hoc fixes

#### Idempotency and dedup

Automations may emit duplicate acknowledgements for the same external event.

Include a stable dedup signal (for example, hashed provider event key) and define indexer/client dedup behavior.

#### Timing semantics

Separate:

- `createdAt`: when ATProto record is created
- `occurredAt` (optional): when contribution happened externally

### Indexing/discovery implications

Current steward discovery (`fund.at.disclosure`, `fund.at.contribute`, `fund.at.dependencies`) is steward-centric.

Contribution acknowledgement records are relationship/event-centric and likely require indexer support for robust cross-repo discovery.

### Non-goals

- processing payments
- enforcing transfer settlement
- certifying legal/tax validity of contributions
- replacing external provider receipts
