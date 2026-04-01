# at.fund

Fund what you use. Sign in with ATProto OAuth, and the app discovers the tools, feeds, and labelers you rely on — then surfaces how to support each one.

## How it works

1. **Sign in** with your Bluesky handle
2. **Scan** — the app reads your repo collections, follows, feed subscriptions, and labeler subscriptions
3. **Resolve** — each account is enriched with `fund.at.*` records from their PDS, or from a curated manual catalog
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

## API

- `GET /api/lexicons/stream?extraStewards=whtwnd.com,roomy.space` — streaming NDJSON scan (primary). Requires session cookie.
- `GET /api/lexicons?extraStewards=...` — non-streaming JSON scan (legacy).
- `GET /api/steward?uri=...` — single steward lookup (for dependency modal drill-down).

## Project layout

```
src/
├── app/                              Next.js pages and API routes
├── components/
│   ├── GiveClient.tsx                Streaming scan client + card layout
│   ├── ProjectCards.tsx              Card components (StewardCard, PdsHostSupportCard)
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
    │   └── scan-stream.ts            Orchestrator
    ├── catalog.ts                    Steward URI resolver + manual catalog lookup
    ├── steward-model.ts              StewardEntry type (shared between pipeline and UI)
    ├── steward-merge.ts              Client-side entry dedup (EntryIndex)
    └── steward-funding.ts            fund.at.* record fetching from PDS
```

## Adding a project to the catalog

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
