/**
 * Run an async function over an array of items with bounded concurrency.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = []
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}
