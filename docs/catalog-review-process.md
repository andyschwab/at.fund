# Manual catalog review process

How to discover and add AT Protocol applications to `src/data/manual-catalog.json`.

## Why this matters

The manual catalog is the fallback source for steward metadata. When a user's repo contains records from an app that hasn't published `fund.at.*` records on its own PDS, the manual catalog provides the display name, description, landing page, and funding links shown on steward cards.

The more complete the catalog, the fewer "unknown" cards users see.

## What qualifies for the catalog

An entry belongs in the manual catalog if the app **defines its own custom lexicons and writes records to user repositories**. This is what triggers steward card display during `scanRepo()`.

**Include:**
- Apps with custom NSID prefixes that store records on user PDSs (e.g., `com.whtwnd.blog.entry`, `events.smokesignal.rsvp`)
- Infrastructure that defines shared lexicons (e.g., `lexicon.community`, `standard.site`)
- Services with high record activity on the network

**Exclude:**
- Alternative Bluesky clients that only read/write `app.bsky.*` records (Graysky, deck.blue, Skeets, etc.)
- Browser extensions, analytics dashboards, feed generators, labelers
- Tools that don't write their own record types to user repos

## Discovery sources

Check these sources in order. Each has different strengths.

### 1. Lexicon Garden (https://lexicon.garden/)

Best source for **active lexicons with real usage data**. Shows 7-day event counts per NSID, which reveals how actively each app is being used.

- Browse the "Most Active" view for high-traffic community lexicons
- Look for NSID prefixes you don't recognize
- Cross-reference NSID ownership to find the steward domain

### 2. awesome-lexicons (https://github.com/lexicon-community/awesome-lexicons)

Community-maintained list of known lexicon schemas. Organized by app.

- Check the README for recently added entries
- Look at recent commits/PRs for newly added apps

### 3. Bluesky Directory (https://blueskydirectory.com/)

Comprehensive directory of Bluesky/ATProto tools. Organized by category (Clients, Utilities, Schedulers, etc.).

- Focus on apps in the "Other" or non-client categories
- Many listed apps are Bluesky clients (which we exclude), so filter carefully

### 4. TechCrunch / press coverage

Search for recent articles about AT Protocol apps. TechCrunch has covered the ecosystem.

- Search: `"AT Protocol" apps site:techcrunch.com`
- Search: `"atproto" new app launch`

### 5. ATProto community channels

- Bluesky itself (search for announcements of new apps)
- ATProto GitHub discussions (https://github.com/bluesky-social/atproto/discussions)

### 6. awesome-atproto (https://github.com/atblueprints/awesome-atproto)

Another community-maintained list, broader than awesome-lexicons.

## Adding a new entry

### 1. Determine the steward URI

The steward URI is the canonical hostname (or DID) for the project. Usually it matches the app's main domain.

Check if NSID hostname inference will produce the correct steward URI:
- For a 3+ segment NSID like `events.smokesignal.rsvp`, the first two segments reverse to `smokesignal.events`
- If this matches the steward domain, no resolver override is needed
- If it doesn't match (e.g., `com.shinolabs.pinksea.*` should map to `pinksea.art`), add an override to `resolver-catalog.json`

### 2. Add to manual-catalog.json

Add an entry under `records` keyed by the steward URI:

```json
"example.app": {
  "disclosure": {
    "meta": {
      "displayName": "Example App",
      "description": "Brief description of what this app does.",
      "landingPage": "https://example.app"
    },
    "contact": {
      "general": {
        "handle": "example.app"
      }
    }
  }
}
```

**Required:** `disclosure.meta.displayName` (the entry is ignored without it).

**Optional but recommended:**
- `description` - one sentence explaining what the app does
- `landingPage` - canonical website URL
- `contact.general.handle` - ATProto handle for the maintainer or app

**Optional:**
- `contribute.links[]` - funding/support links (`{ "label": "...", "url": "..." }`)
- `dependencies.uris[]` - other steward URIs this app depends on

### 3. Add resolver override if needed

If the NSID prefix doesn't naturally infer to the steward URI, add an entry to `src/data/resolver-catalog.json`:

```json
{ "matchPrefix": "com.shinolabs.pinksea.", "stewardUri": "pinksea.art" }
```

The resolver uses longest-prefix matching, so more specific prefixes take priority.

### 4. Validate

```bash
python3 -m json.tool src/data/manual-catalog.json > /dev/null
python3 -m json.tool src/data/resolver-catalog.json > /dev/null
```

## Periodic review checklist

Run this review quarterly (or when the ecosystem has notable new launches).

- [ ] Check Lexicon Garden "Most Active" for new high-activity NSID prefixes
- [ ] Check awesome-lexicons and awesome-atproto for newly listed apps
- [ ] Search Bluesky Directory for new entries in non-client categories
- [ ] Search press/blogs for newly launched AT Protocol apps
- [ ] For each new app found:
  - [ ] Confirm it writes custom lexicon records to user repos
  - [ ] Identify the steward domain and NSID prefix
  - [ ] Check if NSID inference works or if a resolver override is needed
  - [ ] Add the manual-catalog entry with at minimum `displayName`
  - [ ] Look for funding/support links to add as `contribute.links`
- [ ] Validate JSON files
- [ ] Test locally by signing in with an account that uses some of the new apps

## Current catalog statistics

As of 2026-03-30: **43 steward entries**, **16 resolver overrides**.
