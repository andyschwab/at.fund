# Backend Indexing Strategy

## Status: Active discussion — selecting approach

This document evaluates strategies for replacing the per-user PDS crawl with a
persistent backend index of all `fund.at.*` records across the Atmosphere.

## The Problem

Today, every scan makes **O(follows)** network calls: one Slingshot
`resolveMiniDoc` + one PDS `listRecords` per follow. For a user with 1,500
follows, that's 3,000 HTTP requests behind a 20-concurrency limiter, plus a
hard cap at 2,500 follows. The results are cached for 15 minutes per unique
follow-set fingerprint, but cache misses trigger a full re-crawl.

Concrete pain points:

1. **Scan latency** — large follow counts push scans past 30 seconds, sometimes
   hitting Vercel's 180-second `maxDuration`. Users see a spinner.
2. **Incomplete data** — endorsements from non-follows are invisible. The app
   can only show "N endorsements from your network," never global counts.
3. **Redundant work** — every user re-discovers the same endorsement data. If
   Alice and Bob both follow the same 500 accounts, those 500 PDS queries
   happen twice.
4. **Endorsement cap** — the 2,500 follow limit is a hard ceiling on data
   quality. Power users with 5k+ follows get degraded results.
5. **No global view** — we can't answer "what are the most-endorsed projects
   across the network?" without a persistent index.

## What We Need to Track

All `fund.at.*` records across the entire network — not just endorsements:

| Collection NSID | What it gives us |
|----------------|------------------|
| `fund.at.graph.endorse` | Who endorses what — the core social signal |
| `fund.at.graph.dependency` | Dependency graph between projects |
| `fund.at.funding.contribute` | Which DIDs have a funding page |
| `fund.at.funding.channel` | Payment channels (GitHub Sponsors, etc.) |
| `fund.at.funding.plan` | Funding tiers and pricing |
| `fund.at.actor.declaration` | Ecosystem participation signals |

Plus legacy NSIDs during migration: `fund.at.endorse`, `fund.at.dependency`,
`fund.at.contribute`.

Tracking all of these eliminates the per-user PDS crawl entirely. The scan
pipeline becomes: look up the user's follows → intersect with the pre-built
index → done. O(1) Redis reads instead of O(follows) HTTP requests.

## Strategy Options

### Strategy 1: Jetstream Listener (Recommended Starting Point)

**What:** A lightweight Node.js/Bun process that connects to Bluesky's public
Jetstream WebSocket and filters for `fund.at.*` collections.

**How it works:**

```
wss://jetstream2.us-east.bsky.network/subscribe
  ?wantedCollections=fund.at.graph.endorse
  &wantedCollections=fund.at.graph.dependency
  &wantedCollections=fund.at.funding.contribute
  &wantedCollections=fund.at.funding.channel
  &wantedCollections=fund.at.funding.plan
  &wantedCollections=fund.at.actor.declaration
  &wantedCollections=fund.at.endorse
  &wantedCollections=fund.at.dependency
  &wantedCollections=fund.at.contribute
```

Jetstream supports up to 100 `wantedCollections` filters, and custom lexicon
NSIDs work as long as they pass NSID validation (ours do). It also supports
NSID prefix wildcards like `fund.at.*` — which would capture all current and
future collections in one filter.

```
┌─────────────┐   WebSocket    ┌──────────────┐
│  Jetstream   │ ────────────▶ │  Collector    │
│  (public)    │  fund.at.*    │  (Fly.io)     │
└─────────────┘               └──────┬───────┘
                                     │ writes
                                     ▼
                              ┌──────────────┐
                              │ Upstash Redis │
                              └──────┬───────┘
                                     │ reads
                                     ▼
                              ┌──────────────┐
                              │   at.fund    │
                              │  (Vercel)    │
                              └──────────────┘
```

**Redis data model:**

```
# Endorsements — the hot path
endorse:by-subject:<did>        → Set<endorser-did>     # who endorses this DID
endorse:by-author:<did>         → Set<endorsed-did>     # what this DID endorses

# Fund.at records — replaces per-user PDS fetches
fundat:contribute:<did>         → JSON { contributeUrl }
fundat:channels:<did>           → JSON [ channel records ]
fundat:plans:<did>              → JSON [ plan records ]
fundat:deps:<did>               → Set<dependency-did>
fundat:declaration:<did>        → JSON { exists: true }

# Cursor for gapless reconnection
index:cursor                    → time_us (Unix microseconds)
```

**Advantages:**
- Zero infrastructure beyond a single process + existing Redis
- Free tier viable: Fly.io free (1 shared CPU, 256MB) + Upstash free tier
- `fund.at.*` volume is tiny — probably single-digit events per minute today
- Cursor-based reconnection with ~72h replay buffer on public instances
- Prefix filter (`fund.at.*`) catches future collections automatically
- No CBOR decoding — Jetstream delivers pre-decoded JSON

**Disadvantages:**
- Depends on Bluesky's public Jetstream instances (no SLA)
- ~72h replay buffer means extended downtime requires backfill
- No historical data — need a one-time backfill for existing records
- Single-connection model (if the process dies, events are missed until restart)

**Backfill:** Jetstream only has ~72h replay. Historical records from before
the listener started require a separate backfill — see Backfill Strategy
section below for options.

**Estimated effort:** 1-2 days for the collector, 1 day for pipeline integration.

**Cost:** $0/month (Fly.io free + Upstash paid tier already available).

---

### Strategy 2: Spacedust / Microcosm Relay API

**What:** Use the Spacedust API (`spacedust.microcosm.blue`) which provides a
relay subscription endpoint that may offer filtered access to ATProto events.

**How it works:**

Spacedust is built by the team behind Frontpage/Unravel (the ATProto link
aggregator). Their `GET /subscribe` endpoint likely wraps the firehose with
additional features. We already depend on their Slingshot service for
`resolveMiniDoc` (DID → PDS resolution), so there's an existing relationship.

**What we'd need to confirm:**
- Does `/subscribe` support filtering by custom collection NSIDs?
- What's the replay buffer / cursor semantics?
- Is there a rate limit or usage policy for third-party apps?
- Is the service considered stable/production-grade?

**Advantages:**
- Potentially richer API than raw Jetstream (identity resolution built in)
- Existing dependency on microcosm.blue infrastructure
- May handle CBOR decoding and provide a cleaner event format

**Disadvantages:**
- Third-party service with no published SLA or stability guarantees
- Less documentation than Jetstream (API docs returned 403 when we checked)
- Additional dependency on a small team's infrastructure
- Unclear whether custom lexicon filtering is supported

**Recommendation:** Worth investigating as a complement to Strategy 1, not a
replacement. If Spacedust offers features that simplify the collector (e.g.,
pre-resolved identities, better backfill support), it could be the better
WebSocket source. But Jetstream is the safer default given its official status.

**Action item:** Reach out to the Microcosm team to understand Spacedust's
capabilities and intended use cases.

---

### Strategy 3: Tap (ATProto Sync Service)

**What:** Tap is Bluesky's official sync utility from the Indigo project. It
sits between a full relay and raw Jetstream — it subscribes to the relay
firehose, but only tracks repos that match your collection filters. Crucially,
it has a **collection signal mode** that auto-discovers every repo on the
network that has ever written a record in a specified collection, then backfills
their full history.

**How it works:**

```bash
docker run -p 2480:2480 \
  -e TAP_SIGNAL_COLLECTION=fund.at.graph.endorse \
  -e TAP_COLLECTION_FILTERS=fund.at.* \
  -v ./data:/data \
  ghcr.io/bluesky-social/indigo/tap:latest
```

- `TAP_SIGNAL_COLLECTION` — **which repos to track**: any repo with at least
  one record in this collection gets auto-discovered and fully backfilled
- `TAP_COLLECTION_FILTERS` — **which records to deliver**: only `fund.at.*`
  events are forwarded to our app, everything else is dropped

Tap connects to the relay (`relay1.us-east.bsky.network` by default),
watches the firehose for repos that write to the signal collection, then
fetches their full repo via `com.atproto.sync.getRepo` from their PDS.
Historical events are delivered with `live: false` before live events, so
we get a complete, ordered view of each repo.

Our collector connects to Tap's WebSocket at `ws://localhost:2480/channel`
and receives clean JSON events — no CBOR decoding needed. Tap handles repo
structure verification, MST integrity, and identity signature validation.

```
┌─────────────┐   firehose    ┌──────────────┐   WebSocket    ┌──────────┐
│  Relay       │ ────────────▶ │  Tap          │ ────────────▶ │ Collector │
│  (public)    │               │  (Docker)     │  fund.at.*    │          │
└─────────────┘               └──────┬───────┘               └────┬─────┘
                                     │ backfill                    │ writes
                                     │ getRepo                    ▼
                              ┌──────┴───────┐               ┌──────────┐
                              │  PDS hosts    │               │  Redis   │
                              └──────────────┘               └──────────┘
```

**Advantages:**
- **Auto-discovers unknown participants** — any DID that has ever written a
  fund.at record gets found via the firehose, even if we've never seen them
- **Full historical backfill** — fetches complete repo history for discovered
  DIDs, not just events from the last 72h
- **Verified data** — validates repo structure and signatures, unlike raw
  Jetstream which trusts the relay
- **Clean JSON output** — same developer experience as Jetstream
- **Handles reconnection** — ordered delivery guarantees no gaps
- **Official Bluesky tooling** — actively maintained, designed for this use case

**Disadvantages:**
- Requires a persistent server (Docker container with storage)
- Connects to the full relay firehose (bandwidth for scanning, though it only
  retains matching repos)
- More moving parts than a bare Jetstream WebSocket connection
- Storage grows with tracked repos (SQLite/PostgreSQL)
- New infrastructure to operate (though it's a single binary)

**Resource estimate for fund.at:**
- fund.at participants are <50 repos today, growing slowly
- Each repo is tiny (a few KB of records)
- SQLite storage: negligible (<1MB)
- RAM: minimal — outbox buffer is mostly empty at our volume
- Bandwidth: firehose scanning is the main cost, but we only retain matches

**Cost:** ~$5-7/month on Railway or Fly.io (needs persistent storage +
always-on process). Could also run on any cheap VPS.

**Estimated effort:** 1 day to deploy Tap + adapt the collector to read from
Tap's WebSocket instead of Jetstream directly, 1 day for pipeline integration.

---

### Strategy 4: Self-Hosted Jetstream

**What:** Run our own Jetstream instance via Docker, consuming from the public
Bluesky relay upstream.

**Advantages over public Jetstream:**
- No dependency on Bluesky's public instance availability
- Can configure larger replay buffers
- Full control over connection parameters and scaling

**Disadvantages:**
- Requires a persistent server (not serverless-compatible)
- Jetstream itself connects upstream to the full Bluesky relay firehose —
  it processes ALL events and filters client-side
- More operational burden than connecting to the public instance
- Overkill given the low volume of `fund.at.*` events

**Recommendation:** Skip for now. The public Jetstream instances are
well-maintained and the `fund.at.*` event volume doesn't justify the
operational overhead. Revisit only if public instances prove unreliable.

---

### Strategy 5: Full ATProto Relay (Indigo)

**What:** Run the reference relay implementation from `bluesky-social/indigo`.
This subscribes to the entire ATProto network and maintains a full copy of
all repo events.

**Requirements:**
- Dedicated server (not a container — needs serious I/O)
- PostgreSQL database
- Significant bandwidth (the full firehose is high-throughput)
- Ongoing operational maintenance

**What it gives us:**
- Complete historical data for all repos
- Zero dependency on third-party instances
- Ability to backfill any collection at any time
- Could serve as infrastructure for other features (full-text search, analytics)

**Disadvantages:**
- Massive overkill for tracking 9 low-volume collections
- High operational cost (bandwidth is the dominant expense — cloud providers
  like AWS/GCP charge premium rates; budget providers like Hetzner or OVH
  are recommended by the Indigo docs)
- Single-server architecture with non-trivial failure modes
- "Not as well documented or supported as the PDS reference implementation"
  per the Indigo README

**Recommendation:** Avoid unless we need to become an AppView or offer
relay services to others. The cost/complexity ratio is terrible for our
use case.

---

### Strategy 6: Hybrid — Jetstream + PDS Fallback

**What:** Deploy the Jetstream listener (Strategy 1) but keep the existing
per-user PDS crawl as a live fallback, not just for backfill.

**How the pipeline changes:**

```
# Current: everything is per-user crawl
Phase 2: for each follow → Slingshot → PDS → endorsements    O(follows)

# Hybrid: index-first with PDS fallback
Phase 2:
  1. Read endorsement index from Redis                        O(1)
  2. If index is fresh (cursor < 5 min old):
       return indexed data, skip PDS crawl
  3. If index is stale or missing:
       fall back to per-user PDS crawl (current behavior)
```

**Advantages:**
- Zero-downtime migration — the PDS fallback means the index can be down
  without user impact
- Gradual rollout — feature-flag the index read path
- Validates index correctness against the existing PDS crawl

**Disadvantages:**
- Two code paths to maintain during transition
- Slightly more complex read logic

**Recommendation:** This is the deployment strategy for Strategy 1, not a
separate strategy. Always keep the PDS fallback during initial rollout.

## Recommended Approach

**Phase 1: Tap + Collector (Strategy 3 + 6)**

Deploy Tap with collection signal mode to auto-discover all repos that have
ever written `fund.at.*` records, backfill their full history, and stream
live events. The collector reads from Tap's WebSocket and writes to Redis.
Keep the PDS crawl as a fallback during rollout. This gets us:

- Global endorsement counts (not just network)
- Near-instant scan times for the endorsement phase
- Elimination of the 2,500 follow cap
- Fund.at record data without per-user PDS fetches

**Phase 2: Full Pipeline Integration**

Once the index is proven reliable, refactor the pipeline to read all fund.at
data from the index:

- Phase 2 (endorsements): Redis set intersection instead of PDS crawl
- Phase 4 (enrich): Redis lookup instead of speculative prefetch
- ScanContext changes: `fundAtPrefetch` map becomes a Redis read cache
  instead of a PDS fetch map

**Phase 3: New Capabilities**

With a global index, we can build features that are impossible today:

- **Global endorsement leaderboard** — most-endorsed projects across the
  entire ATProto network
- **Trending** — newly-endorsed projects (time-series from the event stream)
- **Ecosystem health dashboard** — total fund.at records, active endorsers,
  funding channels in use
- **Push notifications** — "someone endorsed your project" (real-time from
  the event stream)
- **Public API** — expose endorsement counts and funding data as an API for
  other ATProto apps

## Implementation Sketch: Jetstream Collector

### Collector process (`collector/index.ts`)

```typescript
import { Redis } from '@upstash/redis'
import WebSocket from 'ws'

const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe'
const WANTED = 'fund.at.*'  // prefix filter catches all fund.at collections

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

async function connect() {
  // Resume from last cursor (with 5s safety buffer)
  const cursor = await redis.get<string>('index:cursor')
  const params = new URLSearchParams({ wantedCollections: WANTED })
  if (cursor) params.set('cursor', String(Number(cursor) - 5_000_000))

  const ws = new WebSocket(`${JETSTREAM_URL}?${params}`)

  ws.on('message', async (raw: Buffer) => {
    const event = JSON.parse(raw.toString())
    if (event.kind !== 'commit') return

    const { did } = event
    const { collection, operation, record, rkey } = event.commit

    await routeEvent(did, collection, operation, record, rkey)
    await redis.set('index:cursor', event.time_us)
  })

  ws.on('close', () => setTimeout(connect, 2000))  // auto-reconnect
  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
    ws.close()
  })
}

/** Resolve a subject to a DID at ingest time. DIDs pass through;
 *  handles/hostnames go through resolveHandle / DNS. On failure,
 *  queues for retry via the dead-letter set. */
async function normalizeSubject(raw: string): Promise<string | undefined> {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('did:')) return trimmed
  // Handle or hostname — try plc.directory / resolveHandle
  try {
    const res = await fetch(
      `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(trimmed)}`,
    )
    if (res.ok) {
      const data = await res.json() as { did: string }
      return data.did
    }
  } catch { /* fall through */ }
  return undefined
}

async function routeEvent(
  did: string,
  collection: string,
  operation: string,
  record: any,
  rkey: string,
) {
  // --- Endorsements ---
  if (collection === 'fund.at.graph.endorse' || collection === 'fund.at.endorse') {
    const raw = record?.subject ?? record?.uri
    if (!raw) return
    const subject = await normalizeSubject(raw)
    if (!subject) {
      // Dead-letter for retry — resolution failed
      await redis.sadd('index:unresolved', JSON.stringify({ did, collection, subject: raw, time_us: Date.now() * 1000 }))
      return
    }
    if (operation === 'create') {
      await redis.sadd(`endorse:by-subject:${subject}`, did)
      await redis.sadd(`endorse:by-author:${did}`, subject)
    } else if (operation === 'delete') {
      await redis.srem(`endorse:by-subject:${subject}`, did)
      await redis.srem(`endorse:by-author:${did}`, subject)
    }
    return
  }

  // --- Dependencies ---
  if (collection === 'fund.at.graph.dependency' || collection === 'fund.at.dependency') {
    const raw = record?.subject ?? record?.uri
    if (!raw) return
    const subject = await normalizeSubject(raw)
    if (!subject) {
      await redis.sadd('index:unresolved', JSON.stringify({ did, collection, subject: raw, time_us: Date.now() * 1000 }))
      return
    }
    if (operation === 'create') {
      await redis.sadd(`fundat:deps:${did}`, subject)
    } else if (operation === 'delete') {
      await redis.srem(`fundat:deps:${did}`, subject)
    }
    return
  }

  // --- Contribute URL ---
  if (collection === 'fund.at.funding.contribute' || collection === 'fund.at.contribute') {
    if (operation === 'create') {
      await redis.set(`fundat:contribute:${did}`, JSON.stringify({
        contributeUrl: record?.url ?? record?.contributeUrl,
      }))
    } else if (operation === 'delete') {
      await redis.del(`fundat:contribute:${did}`)
    }
    return
  }

  // --- Channels ---
  if (collection === 'fund.at.funding.channel') {
    // Channels use rkey as identifier — store as hash
    if (operation === 'create') {
      await redis.hset(`fundat:channels:${did}`, { [rkey]: JSON.stringify(record) })
    } else if (operation === 'delete') {
      await redis.hdel(`fundat:channels:${did}`, rkey)
    }
    return
  }

  // --- Plans ---
  if (collection === 'fund.at.funding.plan') {
    if (operation === 'create') {
      await redis.hset(`fundat:plans:${did}`, { [rkey]: JSON.stringify(record) })
    } else if (operation === 'delete') {
      await redis.hdel(`fundat:plans:${did}`, rkey)
    }
    return
  }

  // --- Declaration ---
  if (collection === 'fund.at.actor.declaration') {
    if (operation === 'create') {
      await redis.set(`fundat:declaration:${did}`, '1')
    } else if (operation === 'delete') {
      await redis.del(`fundat:declaration:${did}`)
    }
    return
  }
}

connect()
```

### Reading from the index (pipeline integration)

```typescript
// Replace collectNetworkEndorsements() with:
async function getEndorsementsFromIndex(
  subjectDid: string,
  followDids: Set<string>,
): Promise<{ global: number; network: number }> {
  const endorserDids = await redis.smembers(`endorse:by-subject:${subjectDid}`)
  const network = endorserDids.filter(did => followDids.has(did)).length
  return { global: endorserDids.length, network }
}

// Replace fetchFundAtForStewardDid() with:
async function getFundAtFromIndex(did: string): Promise<FundAtResult | null> {
  const [contribute, channels, plans, deps, declaration] = await Promise.all([
    redis.get(`fundat:contribute:${did}`),
    redis.hgetall(`fundat:channels:${did}`),
    redis.hgetall(`fundat:plans:${did}`),
    redis.smembers(`fundat:deps:${did}`),
    redis.get(`fundat:declaration:${did}`),
  ])
  // ... assemble into FundAtResult
}
```

## Resolved: URI Normalization at Ingest Time

Endorsement and dependency subjects can be DIDs, handles, or hostnames. We
resolve to DIDs eagerly in the collector rather than deferring to read time.

**Why ingest-time:** The index is keyed by DID everywhere else. If we store
raw handles/hostnames, every read query has to resolve them, which pushes
latency and failure modes back into the hot path — exactly what we're trying
to eliminate. With <50 participants and single-digit events/minute, the
resolution cost at ingest is negligible.

**How it works in the collector:**

```typescript
import { resolveRefToDid } from '@/lib/identity'

/** Resolve a subject to a DID. DIDs pass through; handles and hostnames
 *  go through plc.directory / resolveHandle. Returns undefined on failure. */
async function normalizeSubject(raw: string): Promise<string | undefined> {
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('did:')) return trimmed
  // Handle or hostname — resolve to DID
  return resolveRefToDid(trimmed)
}
```

For endorsements and dependencies, the collector calls `normalizeSubject()`
before writing to Redis. If resolution fails (transient DNS/PDS issue), the
event is logged to a dead-letter set (`index:unresolved`) with the raw subject
and author DID, and retried on a timer. At current volume this set will rarely
have entries.

```
index:unresolved  → Set<JSON { did, collection, subject, time_us }>
```

A background sweep (every 5 minutes) retries unresolved entries and promotes
them to the main index on success.

## Resolved: Upstash Capacity

Upstash has been upgraded — no free tier constraints. Command budget and storage
are not concerns.

## Backfill Strategy

The critical question: how do we discover DIDs that have written `fund.at.*`
records but aren't in our 54-entry manual catalog? There are users in the wild
who have created records that we don't know about. There is no ATProto API to
query "all repos that contain collection X" — record enumeration is per-repo.

### Option A: Tap auto-discovery (recommended)

Tap's **collection signal mode** solves the discovery problem natively. When
configured with `TAP_SIGNAL_COLLECTION=fund.at.graph.endorse`, Tap watches the
relay firehose for any repo that writes to that collection. When it finds one,
it fetches the **full repo history** from that DID's PDS via
`com.atproto.sync.getRepo` and delivers all historical events (marked
`live: false`) before switching to live events for that repo.

This means Tap will:
1. Observe the firehose for any `fund.at.graph.endorse` write (the most common
   collection — if someone is using fund.at, they've probably endorsed something)
2. Fetch that repo's complete history from its PDS
3. Deliver all `fund.at.*` records (filtered by `TAP_COLLECTION_FILTERS`)
   to our collector in chronological order

**What about DIDs who wrote records in the past but haven't written new ones
since Tap started?** This is the gap. Tap discovers repos when it sees a
matching event on the firehose. If a DID wrote `fund.at.graph.endorse` six
months ago and hasn't written anything since, Tap won't see them until they
write again.

To close this gap, we seed Tap with known DIDs in parallel:

### Option B: Seed known DIDs into Tap

Tap has a `POST /repos/add` endpoint that explicitly adds DIDs to track. We
feed it every DID we know about — catalog entries, endorser DIDs discovered
during user scans, and any DIDs we can enumerate from existing Redis caches.

```bash
# Seed catalog DIDs into Tap
for did in $(jq -r '.did' src/data/catalog/*.json | sort -u); do
  curl -X POST http://tap:2480/repos/add -d "{\"did\": \"$did\"}"
done
```

Tap then backfills each added repo's full history. Combined with the
collection signal mode running in parallel, this gives us:

- **Known participants** (catalog + scan history): seeded explicitly via
  `/repos/add`, backfilled immediately
- **Unknown participants who are still active**: discovered automatically via
  collection signal when they next write a fund.at record
- **Unknown participants who are dormant**: the only gap — these are DIDs who
  wrote fund.at records before Tap started and haven't written since

### Option C: PDS crawl (fallback for Jetstream-only approach)

If we go with Strategy 1 (bare Jetstream, no Tap), we need a manual backfill
since Jetstream has no historical replay beyond ~72h:

```typescript
import { fetchFundAtRecords, resolvePdsUrl } from '@/lib/fund-at-records'
import { runWithConcurrency } from '@/lib/concurrency'

async function backfill(dids: string[]) {
  await runWithConcurrency(dids, 10, async (did) => {
    const records = await fetchFundAtRecords(did)
    if (records) await writeToIndex(did, records)

    const pdsUrl = await resolvePdsUrl(did)
    if (pdsUrl) {
      const endorsements = await fetchEndorseRecords(did, pdsUrl.origin)
      for (const subject of endorsements) {
        const resolved = await normalizeSubject(subject)
        if (resolved) {
          await redis.sadd(`endorse:by-subject:${resolved}`, did)
          await redis.sadd(`endorse:by-author:${did}`, resolved)
        }
      }
    }
  })
  await redis.set('index:cursor', String(Date.now() * 1000))
}
```

This only covers known DIDs — it cannot discover unknown wild users.

### Closing the dormant-user gap

For the small number of dormant unknown participants (wrote fund.at records
historically, not in our catalog, not recently active), there is no cheap
canonical ATProto API to enumerate them. The realistic options:

1. **Wait for activity** — most users who wrote fund.at records will write
   again eventually. Tap's signal mode catches them when they do.
2. **Social discovery** — post on Bluesky asking fund.at users to visit the
   app or endorse something, which triggers Tap discovery.
3. **Piggyback on scans** — when existing users scan, their follows' PDS
   records are already checked for endorsements. Any endorser DID discovered
   this way gets fed to Tap via `/repos/add` to trigger a full backfill.
4. **Full relay replay** — connect to `com.atproto.sync.subscribeRepos` with
   cursor=0 and scan the entire network history for fund.at collections.
   Complete but extremely expensive (days of replay, CBOR decoding required).
   Not worth it for a handful of dormant users.

At <50 total participants, the dormant-unknown set is likely single digits.
Options 1 + 3 close the gap organically over a few weeks.

### Recommended backfill sequence (Tap approach)

```
1. Deploy Tap with signal + filter:
     TAP_SIGNAL_COLLECTION=fund.at.graph.endorse
     TAP_COLLECTION_FILTERS=fund.at.*

2. Seed known DIDs:
     POST /repos/add for each catalog DID (~54)
     POST /repos/add for any endorser DIDs from Redis caches

3. Wait for Tap to backfill seeded repos:
     ~54 repos × getRepo from PDS → minutes at most

4. Start the collector reading from Tap's WebSocket:
     ws://tap:2480/channel → routeEvent() → Redis

5. Tap continues discovering new repos via signal mode:
     Any new fund.at.graph.endorse write → auto-track + backfill
```

The entire bootstrap takes minutes. Tap handles the hard discovery problem
automatically going forward. The only gap is dormant unknowns, which close
organically as users interact with the network.

## Open Questions

1. **Collector monitoring**: How do we know if the collector/Tap is down?
   Options:
   - Tap's built-in `/health` endpoint
   - Check `index:cursor` freshness from the at.fund app — if it's >5 minutes
     stale, fall back to PDS crawl
   - Tap's `/stats/repo-count` and `/stats/record-count` for growth tracking

2. **Tap hosting**: Tap needs persistent storage and an always-on process.
   Railway has documented support. Fly.io with a volume works too. Any cheap
   VPS (Hetzner, OVH) also works. The bandwidth cost of scanning the firehose
   is the main consideration — budget providers are preferred.

3. **Spacedust capabilities**: Can Spacedust's `/subscribe` endpoint offer
   anything Tap/Jetstream can't? Worth investigating before committing. The
   identity resolution features of the Microcosm stack could simplify the
   collector if they support custom lexicon filtering.

4. **Signal collection scope**: `TAP_SIGNAL_COLLECTION` takes a single NSID.
   Using `fund.at.graph.endorse` catches anyone who has endorsed, but misses
   DIDs who only wrote contribute/channel/plan records without endorsing.
   This is likely a tiny set, but we could also run a second Tap instance
   with a different signal collection, or periodically scan for these edge
   cases.

## Cost Comparison

| Strategy | Monthly Cost | Effort | Ops Burden | Backfill |
|----------|-------------|--------|------------|----------|
| Tap + collector | ~$5-7 | 2 days | Low-Medium | Automatic |
| Jetstream listener (Fly.io free) | $0 | 2 days | Low | Manual (known DIDs only) |
| Self-hosted Jetstream | ~$5-15 | 3 days | Medium | Manual (known DIDs only) |
| Full relay (Indigo) | $50-200+ | 1-2 weeks | High | Complete |
| Spacedust API | $0? | 2 days | Low | Unknown |

## Relationship to Existing Docs

This document supersedes `docs/jetstream-endorsement-collector.md` which
covered endorsement indexing only. The scope here is broader: all `fund.at.*`
collections, not just endorsements.

Key architectural changes from that doc:
- **All collections, not just endorse** — eliminates the entire per-user PDS
  crawl, not just the endorsement phase
- **Dual-index for endorsements** — both by-subject and by-author, enabling
  "what has this user endorsed?" queries without scanning
- **Hash storage for channels/plans** — preserves rkey identity for
  record-level updates
- **Hybrid fallback** — PDS crawl remains active during rollout, not just
  for backfill
