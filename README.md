# Contribute to your ATProto tools (MVP)

Next.js app: sign in with ATProto OAuth, scan **non-Bluesky-app** collections present in your repository, and match them to a curated list of apps and contribution links. Optional self-reported NSIDs are merged in.

## Local development

1. Copy `.env.example` to `.env.local` (or export `PUBLIC_URL`).
2. Use **`http://127.0.0.1:3000`** (not `localhost`) so OAuth redirect URIs match the ATProto localhost client rules.
3. `npm install` then `npm run dev`.

Open `http://127.0.0.1:3000`, enter your handle, complete OAuth on your PDS, then review the table.

## Deploy

Set `PUBLIC_URL` to your HTTPS origin (no trailing slash). The app switches from loopback OAuth metadata to URL-based `client_id` (`{PUBLIC_URL}/oauth-client-metadata.json`) when the public URL is not loopback.

## Maintainer docs

- In-app guide: `/maintainers` (see [src/app/maintainers/page.tsx](src/app/maintainers/page.tsx)).
- Lexicon JSON: [lexicon/fund.at.contribute.json](lexicon/fund.at.contribute.json) (`fund.at.contribute`).

## API

- `POST /api/lexicons` — body `{ "selfReportedNsids": ["com.example.foo"] }` (optional). Requires session cookie.
- `GET /api/lexicons?extraCollections=com.example.foo,com.example.bar` — same merge via query string.

## Project layout

- `src/lib/auth` — OAuth client and session helpers.
- `src/lib/repo-inspect.ts` — filter `app.bsky.*`, `com.atproto.*`, `chat.bsky.*`.
- `src/data/lexicon-catalog.json` — curated NSID prefix → links; extend via PR.
