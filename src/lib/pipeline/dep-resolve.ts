import type { StewardEntry } from '@/lib/steward-model'
import { lookupManualStewardRecord } from '@/lib/catalog'

// ---------------------------------------------------------------------------
// Phase 4: Resolve referenced dependency entries
// ---------------------------------------------------------------------------

/**
 * For all dependency URIs referenced by entries, resolve display info from
 * the manual catalog. These "referenced entries" power the dependency
 * drill-down modal on the client.
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

  for (const entry of entries) {
    for (const depUri of entry.dependencies ?? []) {
      if (knownUris.has(depUri) || resolved.has(depUri)) continue
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
    }
  }

  return referenced
}
