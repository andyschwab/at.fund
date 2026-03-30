# Contribute to your ATProto tools (MVP)

Next.js app: sign in with ATProto OAuth, scan **non-Bluesky** collections in your repository, and resolve them to **steward URIs** — the projects and services behind those records. For each steward, the app tries to fetch `fund.at.*` records from their PDS; when none exist, it falls back to a curated manual catalog. If your PDS hostname publishes `fund.at.*` records, a **Your host** block shows disclosure and optional ways to support that operator.

## Docs

- **[Pipeline overview](docs/pipeline.md)** — end-to-end flow from sign-in to rendered cards.
- **[Domain/DID discovery](docs/atfund-discovery.md)** — DNS `_atproto`, record scoping, resolution.
- **Lexicon schemas:** [fund.at.disclosure](lexicon/fund.at.disclosure.json), [fund.at.contribute](lexicon/fund.at.contribute.json), [fund.at.dependencies](lexicon/fund.at.dependencies.json).
- **In-app maintainer guide:** `/maintainers` ([source](src/app/maintainers/page.tsx)).

## Local development

1. Copy `.env.example` to `.env.local` (or export `PUBLIC_URL`).
2. Use **`http://127.0.0.1:3000`** (not `localhost`) so OAuth redirect URIs match the ATProto localhost client rules.
3. `npm install` then `npm run dev`.

Open `http://127.0.0.1:3000`, enter your handle, complete OAuth on your PDS, then review the results.

## Deploy

Set `PUBLIC_URL` to your HTTPS origin (no trailing slash). The app switches from loopback OAuth metadata to URL-based `client_id` (`{PUBLIC_URL}/oauth-client-metadata.json`) when the public URL is not loopback.

## API

- `POST /api/lexicons` — body `{ "selfReportedStewards": ["whtwnd.com", "did:plc:..."] }` (optional). Requires session cookie.
- `GET /api/lexicons?extraStewards=whtwnd.com,roomy.space` — same merge via query string.

## Project layout

- `src/lib/catalog.ts` — resolver (observed key → steward URI) + manual catalog lookup.
- `src/lib/lexicon-scan.ts` — scan orchestration: repo inspection → steward resolution → card models.
- `src/lib/steward-funding.ts` — fetch `fund.at.*` records from a steward's PDS.
- `src/lib/steward-model.ts` — `StewardCardModel` type shared between pipeline and UI.
- `src/lib/repo-inspect.ts` — filter `app.bsky.*`, `com.atproto.*`, `chat.bsky.*`.
- `src/lib/repo-collection-resolve.ts` — calendar `createdWith` and Standard.site `content.$type` extraction.
- `src/data/manual-catalog.json` — curated steward URI → fund.at-shaped records; extend via PR.
- `src/data/resolver-catalog.json` — NSID prefix → steward URI overrides for non-obvious mappings.
