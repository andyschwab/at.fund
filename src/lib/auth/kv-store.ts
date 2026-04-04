import { Redis } from '@upstash/redis'

// Vercel's Upstash integration uses varying env var names depending on how
// it was provisioned. Try each known pattern.
function getRedis(): Redis {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ??
    process.env.UPSTASH_KV_REST_API_URL ??
    process.env.KV_REST_API_URL
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ??
    process.env.UPSTASH_KV_REST_API_TOKEN ??
    process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    throw new Error('Missing Upstash Redis env vars (UPSTASH_REDIS_REST_URL/TOKEN or UPSTASH_KV_REST_API_URL/TOKEN)')
  }
  return new Redis({ url, token })
}

/**
 * A SimpleStore adapter backed by Upstash Redis.
 * Implements the get/set/del interface required by @atproto/oauth-client-node.
 */
export function createKvStore<V>(prefix: string, ttlSeconds?: number) {
  const redis = getRedis()

  return {
    async get(key: string): Promise<V | undefined> {
      const val = await redis.get<V>(`${prefix}:${key}`)
      return val ?? undefined
    },
    async set(key: string, value: V): Promise<void> {
      if (ttlSeconds) {
        await redis.set(`${prefix}:${key}`, value, { ex: ttlSeconds })
      } else {
        await redis.set(`${prefix}:${key}`, value)
      }
    },
    async del(key: string): Promise<void> {
      await redis.del(`${prefix}:${key}`)
    },
  }
}
