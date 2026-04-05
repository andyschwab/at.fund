# at.fund

Fund what you use. Sign in with ATProto OAuth, and the app discovers the tools, feeds, and labelers you rely on — then surfaces how to support each one.

## How it works

1. **Sign in** with your Bluesky handle
2. **Scan** — the app reads your repo collections, follows, feed subscriptions, and labeler subscriptions
3. **Resolve** — each account is enriched with `fund.at.*` records from their PDS. For projects without an AT Protocol account, a curated catalog provides a fallback
4. **Cards** — one card per account showing contribution links, capabilities (feeds/labelers), and dependencies

See **[docs/pipeline.md](docs/pipeline.md)** for the full pipeline architecture.

## Docs

- **[Pipeline overview](docs/pipeline.md)** — 6-phase scan architecture: gather, endorsements, ecosystem, enrich, capabilities, dependencies
- **[Domain/DID discovery](docs/atfund-discovery.md)** — DNS `_atproto`, record scoping, resolution
- **[Catalog review process](docs/catalog-review-process.md)** — criteria for manual catalog entries
- **[Jetstream endorsement collector](docs/jetstream-endorsement-collector.md)** — future real-time endorsement indexer (concept)
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
| `POST /api/setup` `{ contributeUrl, dependencies, existing }` | Session cookie | Publish/delete fund.at records |
| `POST /api/endorse` `{ uri }` | Session cookie | Create endorsement record |
| `DELETE /api/endorse` `{ uri }` | Session cookie | Remove endorsement record |
| `GET /api/steward?uri=...` | None | Thin steward lookup (legacy) |

## Project layout

```
src/
├── app/                              Next.js pages and API routes
│   └── api/
│       ├── entry/route.ts            Full single-entry resolution
│       ├── setup/route.ts            Publish/delete fund.at records
│       ├── endorse/route.ts          Endorsement create/delete
│       ├── lexicons/stream/route.ts  Streaming scan endpoint
│       └── steward/route.ts          Thin steward lookup (legacy)
├── components/
│   ├── GiveClient.tsx                Streaming scan client + card layout + endorsement
│   ├── SetupClient.tsx               Setup form: contribute URL, dependencies, live preview
│   ├── ProjectCards.tsx              StewardCard (compact <li> row)
│   ├── card-primitives.tsx           Shared building blocks (ProfileAvatar, TagBadges, etc.)
│   ├── card-dependencies.tsx         DependencyRow, ModalCardContent, DependenciesSection
│   ├── HandleAutocomplete.tsx        Bluesky handle typeahead search
│   ├── HandleChipInput.tsx           Chip-based multi-value input for dependencies
│   ├── SuggestionList.tsx            Shared typeahead dropdown
│   ├── NavBar.tsx                    Global nav bar + login/logout modal
│   └── SessionContext.tsx            Auth state context (useSession hook)
├── hooks/
│   ├── useTypeahead.ts               Debounced Bluesky handle typeahead
│   ├── useScanStream.ts              NDJSON streaming fetch + EntryIndex
│   └── useDebounce.ts                Generic debounce hook
├── data/
│   ├── catalog/*.json                Manual funding data per steward (keyed by hostname)
│   └── resolver-catalog.json         NSID prefix → steward URI overrides
└── lib/
    ├── pipeline/                     6-phase scan pipeline
    │   ├── account-gather.ts         Phase 1: discover accounts + fire prefetches
    │   ├── account-enrich.ts         Phase 4: fund.at + catalog + profile resolution
    │   ├── capability-scan.ts        Phase 5: feed/labeler capabilities
    │   ├── dep-resolve.ts            Phase 6: dependency entry resolution
    │   ├── ecosystem-scan.ts         Phase 3: ecosystem URI discovery
    │   ├── entry-resolve.ts          Full vertical resolution for a single entry
    │   └── scan-stream.ts            Orchestrator: creates ScanContext, runs phases
    ├── scan-context.ts               ScanContext — app-wide network orchestrator
    ├── fund-at-prefetch.ts           Speculative fund.at prefetch with bounded concurrency
    ├── steward-model.ts              Identity, Funding, StewardEntry, Capability types
    ├── identity.ts                   buildIdentity, batchFetchProfiles, resolveRefToDid
    ├── funding.ts                    resolveFunding, resolveFundingForDep
    ├── entry-priority.ts             Unified entryPriority() ranking
    ├── catalog.ts                    Steward URI resolver + manual catalog lookup
    ├── steward-merge.ts              Client-side entry dedup (EntryIndex)
    └── fund-at-records.ts            Low-level fund.at record fetching (parallel PDS calls)
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
