/** Collections to hide from the “third-party lexicons” view (Bluesky app + protocol plumbing). */
export function isNoiseCollection(nsid: string): boolean {
  return (
    nsid.startsWith('app.bsky.') ||
    nsid.startsWith('com.atproto.') ||
    nsid.startsWith('chat.bsky.')
  )
}

export function filterThirdPartyCollections(collections: readonly string[]): string[] {
  return collections.filter((c) => !isNoiseCollection(c))
}
