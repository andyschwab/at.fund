# Domain/DID discovery for `fund.at.*`

This describes how clients discover **canonical disclosure, contribution links, and dependency metadata** published on ATProto (`fund.at.disclosure`, optional `fund.at.contribute`, optional `fund.at.dependencies`).

Discovery works from either a **DID** (query directly) or a **hostname** (resolve the hostname’s DID via ATProto’s `_atproto` TXT).

## Inputs

- **DID**: `did:plc:…` or `did:web:…`
- **Hostname**: `example.com`, `pds.example.com`

## Hostname → DID (DNS `_atproto`)

- **TXT name:** `_atproto.<hostname>`
- **Value:** the hostname’s **DID** (commonly `did=did:plc:…`, but clients should accept a bare DID too)

```text
_atproto.pds.example.com  TXT  "did=did:plc:xxxxxxxxxxxxxxxxxxxx"
```

## Resolution (conceptual)

1. Start with an identifier \(DID or hostname\).
2. If it’s a hostname, resolve `_atproto.<hostname>` to a DID.
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

After sign-in, the app resolves the user DID to a DID document, extracts the home PDS URL, resolves that hostname’s DID via `_atproto`, and shows a **Your host** section when disclosure metadata is found.

Well-known HTTPS discovery may be added later; **DNS-only** is the baseline.
