# Jetstream Endorsement Collector (Future)

## Status: Concept — not yet implemented

This doc describes a real-time endorsement indexer using Bluesky's Jetstream
service. It's the next evolution when the current per-follow PDS query approach
becomes a bottleneck.

## Why

The current approach collects endorsements via a single pass over the user's
follows: one Slingshot `resolveMiniDoc` per follow (to find their PDS) + one
PDS `listRecords` per follow (to fetch their `fund.at.endorse` records). This
gives complete network data with zero new infrastructure, but:

- At high follow counts, O(follows) PDS queries add scan latency
- Results are cached per-session with a fingerprint key — cache misses trigger full recollection
- Endorsements from non-follows (the broader network) are invisible
- Each scan rediscovers the same endorsement data

A Jetstream listener eliminates all scan-time API calls — everything reads
from Redis.

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────┐
│  Jetstream   │ ─────────────────▶ │  Collector    │
│  (public)    │  fund.at.endorse  │  (Fly.io)     │
└─────────────┘                    └──────┬───────┘
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

## Collector Service

A ~100 line Node.js script deployed on Fly.io free tier:

1. **Connect** to `wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=fund.at.endorse`
2. **Process** each event:
   - `create`: normalize the endorsed URI, add the author DID to a Redis set
   - `delete`: remove the author DID from the set
3. **Redis data model**:
   - `endorse:dids:<normalized-uri>` → Redis Set of endorser DIDs
   - `endorse:cursor` → last processed `time_us` for gapless reconnection
4. **Reconnection**: on disconnect, resume from saved cursor (subtract 5s safety buffer)

### Pseudocode

```typescript
const ws = new WebSocket(
  'wss://jetstream2.us-east.bsky.network/subscribe' +
  '?wantedCollections=fund.at.endorse'
)

ws.on('message', async (raw) => {
  const event = JSON.parse(raw)
  if (event.kind !== 'commit') return

  const uri = normalizeStewardUri(event.commit.record?.uri)
  if (!uri) return

  const key = `endorse:dids:${uri}`

  if (event.commit.operation === 'create') {
    await redis.sadd(key, event.did)
  } else if (event.commit.operation === 'delete') {
    await redis.srem(key, event.did)
  }

  await redis.set('endorse:cursor', event.time_us)
})
```

### Reading from at.fund

```typescript
// Total endorsement count
const count = await redis.scard(`endorse:dids:${uri}`)

// Network endorsement count (intersection with follows)
const endorserDids = await redis.smembers(`endorse:dids:${uri}`)
const networkCount = endorserDids.filter(did => followDids.has(did)).length
```

## Backfill Strategy

Jetstream only provides live events + ~24h replay buffer. For historical data:

1. **Initial backfill from current approach**: Use the existing Slingshot + PDS
   `listRecords` collection to populate Redis sets for all known endorsers
2. **Switch to Jetstream**: Once caught up, the collector maintains the index
3. **PDS re-scan as fallback**: If the collector goes down for >24h (beyond
   Jetstream's replay window), re-backfill using the per-follow PDS approach

## Deployment

- **Platform**: Fly.io free tier (1 shared CPU, 256MB RAM — more than enough)
- **Cost**: $0/month for the collector; existing Upstash Redis free tier
- **Monitoring**: Fly.io health checks + a simple `/health` endpoint
- **Scaling**: Single instance is sufficient — fund.at.endorse volume is low

## Migration Path

1. Deploy collector alongside existing per-follow PDS queries
2. Verify Redis data matches PDS query results
3. Switch at.fund to read from Redis instead of querying PDS per follow
4. Keep PDS approach as a fallback for cache misses

## When to Build This

Consider building when:
- Follow counts are high enough that per-follow PDS queries add noticeable latency (>5s)
- We want endorsement data from beyond the user's immediate follow graph
- We need sub-minute endorsement freshness
- PDS rate limiting becomes an issue at scale

The current per-follow PDS approach is sufficient until the network has
thousands of active endorsers.
