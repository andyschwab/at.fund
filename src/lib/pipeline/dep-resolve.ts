import type { StewardEntry } from '@/lib/steward-model'
import { lookupManualStewardRecord } from '@/lib/catalog'

// ---------------------------------------------------------------------------
// Phase 4: Resolve referenced dependency entries (multi-level)
// ---------------------------------------------------------------------------

/**
 * For all dependency URIs referenced by entries, resolve display info from
 * the manual catalog. Resolves multiple levels deep so the client can
 * determine correct icon colors (a dep whose sub-dep has a contribute URL
 * shows amber instead of grey).
 *
 * These "referenced entries" power the dependency drill-down modal and
 * the inline dependency row icons.
 */
export function resolveDependencies(
  entries: StewardEntry[],
  onReferenced?: (entry: StewardEntry) => void,
): StewardEntry[] {
  const knownUris = new Set<string>()
  for (const e of entries) {
    knownUris.add(e.uri)
    if (e.did) knownUris.add(e.did)
  }

  const referenced: StewardEntry[] = []
  const resolved = new Set<string>()

  // Seed the queue with deps from primary entries
  const queue: string[] = []
  for (const entry of entries) {
    for (const depUri of entry.dependencies ?? []) {
      if (!knownUris.has(depUri)) queue.push(depUri)
    }
  }

  // Process the queue, adding sub-deps as we discover them
  while (queue.length > 0) {
    const depUri = queue.shift()!
    if (resolved.has(depUri) || knownUris.has(depUri)) continue
    resolved.add(depUri)

    const manual = lookupManualStewardRecord(depUri)
    const refEntry: StewardEntry = {
      uri: depUri,
      tags: ['tool'],
      displayName: depUri,
      source: manual ? 'manual' : 'unknown',
      contributeUrl: manual?.contributeUrl,
      dependencies: manual?.dependencies,
    }
    referenced.push(refEntry)
    onReferenced?.(refEntry)

    // Enqueue sub-deps for next-level resolution
    for (const subDep of manual?.dependencies ?? []) {
      if (!resolved.has(subDep) && !knownUris.has(subDep)) {
        queue.push(subDep)
      }
    }
  }

  return referenced
}
