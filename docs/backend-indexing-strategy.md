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

**Backfill strategy:**
1. Seed from the existing per-user PDS crawl (use the Slingshot + listRecords
   approach as a batch job to populate Redis for all known DIDs)
2. Start the Jetstream listener with cursor set to "now"
3. Any gap between seed completion and listener start is covered by the ~72h
   replay buffer
4. Keep the per-user PDS approach as a fallback for DIDs not yet in the index

**Estimated effort:** 1-2 days for the collector, 1 day for pipeline integration.

**Cost:** $0/month (Fly.io free + Upstash free tier).

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

### Strategy 3: Self-Hosted Jetstream

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

### Strategy 4: Full ATProto Relay (Indigo)

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

### Strategy 5: Hybrid — Jetstream + PDS Fallback

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

**Phase 1: Jetstream Collector (Strategy 1 + 5)**

Deploy a minimal Jetstream listener on Fly.io that indexes all `fund.at.*`
records into Redis. Keep the PDS crawl as a fallback. This gets us:

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

With fewer than 50 active participants, the backfill is trivial — roughly 450
PDS requests total. The goal is to seed the Redis index completely before the
Jetstream listener starts, so there's no gap in coverage.

### Source 1: Manual catalog (54 known DIDs)

The `src/data/catalog/*.json` files each contain a `did` field. These are our
known ecosystem projects. Not all of them will have fund.at records, but we
query them all — it's 54 DIDs.

### Source 2: Discovered endorsers

During normal user scans, we've seen endorsement records from follows. The
existing `collectNetworkEndorsements()` in `microcosm.ts` already returns an
`EndorsementMap` containing endorser DIDs. We can harvest these during the
backfill to discover participants not in the manual catalog.

### Source 3: plc.directory crawl (optional, future)

If we ever need to find every DID that has written a fund.at record without
waiting for Jetstream to observe them, we could crawl plc.directory's export
and check each DID's PDS for fund.at collections. This is expensive and
unnecessary at current scale — Jetstream will catch new participants going
forward.

### Backfill implementation

The backfill runs as a one-shot script (or a `/api/admin/backfill` route
protected by the existing admin auth). It reuses the same PDS resolution and
record fetching logic that the app already has:

```typescript
import { fetchFundAtRecords } from '@/lib/fund-at-records'
import { resolvePdsUrl } from '@/lib/fund-at-records'
import { runWithConcurrency } from '@/lib/concurrency'

async function backfill(dids: string[]) {
  let indexed = 0

  await runWithConcurrency(dids, 10, async (did) => {
    // 1. Fetch all fund.at records from PDS (reuses existing logic)
    const records = await fetchFundAtRecords(did)
    if (records) {
      await writeToIndex(did, records)  // same Redis writes as the collector
      indexed++
    }

    // 2. Fetch endorsement records directly from PDS
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

  // 3. Set the cursor to "now" — Jetstream picks up from here
  await redis.set('index:cursor', String(Date.now() * 1000))

  return { total: dids.length, indexed }
}
```

### Backfill sequence

```
1. Collect DIDs from catalog:  readCatalogDids()     → ~54 DIDs
2. Deduplicate:                Set(catalogDids)       → ~50 unique DIDs
3. Backfill PDS records:       backfill(dids)         → ~450 PDS requests
                               (10 concurrent, ~45s)
4. Set cursor to now:          redis.set(cursor)
5. Start Jetstream listener:   connect()              → live from here
```

The entire backfill takes under a minute with 10-concurrency. No impact on
the 50 existing participants — we're reading their public PDS records, same
as the app already does during normal scans. Each DID gets hit once for all
collections in parallel (the existing `fetchFundAtRecords` already parallelizes
contribute + dependency + channel + plan fetches).

### Avoiding re-backfill

The backfill is idempotent — Redis `SADD` is a no-op for existing members,
and `SET`/`HSET` overwrites are fine since the data is the same. If the
Jetstream listener goes down for longer than the ~72h replay buffer, we
re-run the backfill against the same DID set (plus any new DIDs discovered
via Jetstream before the outage). The cursor is reset and the listener
resumes.

### Growth path

As the network grows beyond 50 participants, new DIDs are automatically
captured by the Jetstream listener — no backfill needed. The only DIDs we'd
miss are those who wrote fund.at records before the listener started and
were never in our catalog. At 50 participants, we likely know all of them.
By the time there are 500 participants, the listener will have been running
long enough to have seen them all.

## Open Questions

1. **Collector monitoring**: How do we know if the collector is down? Options:
   - Fly.io health check hitting a `/health` endpoint
   - Check `index:cursor` freshness from the at.fund app — if it's >5 minutes
     stale, fall back to PDS crawl
   - Upstash Redis pub/sub heartbeat

2. **Multi-region**: Jetstream has US-East and US-West instances. Should we
   run two collectors for redundancy, or is one sufficient given the low
   volume?

3. **Spacedust capabilities**: Can Spacedust's `/subscribe` endpoint offer
   anything Jetstream can't? Worth investigating before committing to a
   Jetstream-only approach. The identity resolution features of the Microcosm
   stack could simplify the collector if they support custom lexicon filtering.

## Cost Comparison

| Strategy | Monthly Cost | Effort | Ops Burden |
|----------|-------------|--------|------------|
| Jetstream listener (Fly.io free) | $0 | 1-2 days | Low |
| Jetstream + paid Redis | ~$10 | 1-2 days | Low |
| Self-hosted Jetstream | ~$5-15 (VPS) | 2-3 days | Medium |
| Full relay (Indigo) | $50-200+ (bandwidth) | 1-2 weeks | High |
| Spacedust API | $0 (if free) | 1-2 days | Low (if stable) |

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
