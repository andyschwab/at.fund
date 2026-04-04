# Jetstream Endorsement Collector (Future)

## Status: Concept — not yet implemented

This doc describes a real-time endorsement indexer using Bluesky's Jetstream
service. It's the next step when Constellation query volume or latency becomes
a bottleneck (Option B from the endorsement data architecture discussion).

## Why

The current approach (Option A) queries Constellation per-URI during each scan.
This gives complete data with zero new infrastructure, but:

- At high scan volume, per-URI queries multiply (N entries × 1 query each)
- Constellation is a public best-effort service with no SLA
- Network endorsement counts require fetching full endorser DID lists
- 15-minute Redis cache means counts are slightly stale

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

1. **Initial backfill from Constellation**: Query `getBacklinks` for all known
   ecosystem URIs and populate Redis sets
2. **Switch to Jetstream**: Once caught up, the collector maintains the index
3. **Constellation as fallback**: If the collector goes down for >24h (beyond
   Jetstream's replay window), re-backfill from Constellation

## Deployment

- **Platform**: Fly.io free tier (1 shared CPU, 256MB RAM — more than enough)
- **Cost**: $0/month for the collector; existing Upstash Redis free tier
- **Monitoring**: Fly.io health checks + a simple `/health` endpoint
- **Scaling**: Single instance is sufficient — fund.at.endorse volume is low

## Migration Path

1. Deploy collector alongside existing Constellation queries
2. Verify Redis data matches Constellation results
3. Switch at.fund to read from Redis instead of querying Constellation
4. Keep Constellation as a fallback for cache misses

## When to Build This

Consider building when:
- Constellation query volume causes rate limiting
- Scan latency from Constellation queries becomes noticeable (>2s added)
- We need sub-minute endorsement freshness
- Constellation has reliability issues

Current Constellation approach is likely sufficient until the network has
thousands of active endorsers.
