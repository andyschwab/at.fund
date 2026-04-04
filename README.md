# at.fund

Fund what you use. Sign in with ATProto OAuth, and the app discovers the tools, feeds, and labelers you rely on — then surfaces how to support each one.

## How it works

1. **Sign in** with your Bluesky handle
2. **Scan** — the app reads your repo collections, follows, feed subscriptions, and labeler subscriptions
3. **Resolve** — each account is enriched with `fund.at.*` records from their PDS. For projects without an AT Protocol account, a curated catalog provides a fallback
4. **Cards** — one card per account showing contribution links, capabilities (feeds/labelers), and dependencies

See **[docs/pipeline.md](docs/pipeline.md)** for the full pipeline architecture.

## Docs

- **[Pipeline overview](docs/pipeline.md)** — 4-phase scan architecture: gather, enrich, capabilities, dependencies
- **[Domain/DID discovery](docs/atfund-discovery.md)** — DNS `_atproto`, record scoping, resolution
- **[Catalog review process](docs/catalog-review-process.md)** — criteria for manual catalog entries
- **Lexicon schemas:** in-app at `/lexicon`, or see `src/lexicons/fund/at/`

## Local development

1. Copy `.env.example` to `.env.local` (or export `PUBLIC_URL`).
2. Use **`http://127.0.0.1:3000`** (not `localhost`) so OAuth redirect URIs match ATProto localhost client rules.
3. `npm install` then `npm run dev`.

## Pages

| Path | Purpose |
|------|---------|
| `/` | Landing page with CTA |
| `/give` | Main card listing (requires auth) |
| `/setup` | Publish your fund.at records |
| `/lexicon` | Lexicon schema documentation |
| `/dev` | API explorer — inline docs and test forms for all endpoints |

## API

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/lexicons/stream?extraStewards=...` | Session cookie | Streaming NDJSON scan (primary) |
| `GET /api/entry?uri=<handle-or-did>` | None | Full single-entry resolution (endorsement, dep modal) |
| `GET /api/steward?uri=...` | None | Thin steward lookup (legacy) |
| `POST /api/endorse` `{ uri }` | Session cookie | Create endorsement record |
| `DELETE /api/endorse` `{ uri }` | Session cookie | Remove endorsement record |

## Project layout

```
src/
├── app/                              Next.js pages and API routes
│   └── api/
│       ├── entry/route.ts            Full single-entry resolution endpoint
│       ├── endorse/route.ts          Endorsement CRUD
│       ├── lexicons/stream/route.ts  Streaming scan endpoint
│       └── steward/route.ts          Thin steward lookup (legacy)
├── components/
│   ├── GiveClient.tsx                Streaming scan client + card layout + endorsement
│   ├── ProjectCards.tsx              StewardCard (compact <li> row)
│   ├── card-primitives.tsx           Shared building blocks (ProfileAvatar, TagBadges, etc.)
│   ├── card-dependencies.tsx         DependencyRow, ModalCardContent, DependenciesSection
│   ├── HandleAutocomplete.tsx        Bluesky handle typeahead search
│   ├── NavBar.tsx                    Global nav bar + login/logout modal
│   └── SessionContext.tsx            Auth state context (useSession hook)
├── data/
│   ├── catalog/*.json                Manual funding data per steward (keyed by hostname)
│   └── resolver-catalog.json         NSID prefix → steward URI overrides
└── lib/
    ├── pipeline/                     4-phase scan pipeline
    │   ├── account-gather.ts         Phase 1: discover accounts
    │   ├── account-enrich.ts         Phase 2: resolve funding info
    │   ├── capability-scan.ts        Phase 3: attach feed/labeler details
    │   ├── dep-resolve.ts            Phase 4: resolve dependency entries
    │   ├── entry-resolve.ts          Full vertical resolution for a single entry
    │   └── scan-stream.ts            Orchestrator
    ├── catalog.ts                    Steward URI resolver + manual catalog lookup
    ├── steward-model.ts              StewardEntry, Capability, StewardTag types
    ├── steward-merge.ts              Client-side entry dedup (EntryIndex)
    └── steward-funding.ts            fund.at.* record fetching from PDS
```

## Adding a project to the catalog

> **Lexicon records are the primary way to publish funding info.** If a project has an AT Protocol account, it should publish `fund.at.*` records via the [setup page](https://at.fund/setup) or directly to its PDS. The catalog is a fallback for projects that can't or don't yet have AT Protocol accounts.

Create a JSON file in `src/data/catalog/` named after the steward's hostname:

```json
{
  "contributeUrl": "https://github.com/sponsors/yourproject"
}
```

Optionally include dependencies:

```json
{
  "contributeUrl": "https://opencollective.com/yourproject",
  "dependencies": ["indigo.ts", "atcute"]
}
```

Submit via PR. See [catalog review process](docs/catalog-review-process.md) for criteria.
