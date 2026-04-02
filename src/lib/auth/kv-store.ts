import { Redis } from '@upstash/redis'

/**
 * A SimpleStore adapter backed by Upstash Redis.
 * Implements the get/set/del interface required by @atproto/oauth-client-node.
 */
export function createKvStore<V>(prefix: string, ttlSeconds?: number) {
  const redis = Redis.fromEnv()

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
