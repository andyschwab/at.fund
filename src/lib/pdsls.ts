/** PDSls explorer — browse ATProto repos and collections. */

export function pdslsRepoUrl(did: string): string {
  return `https://pdsls.dev/at/${did}`
}

export function pdslsCollectionUrl(did: string, collection: string): string {
  return `https://pdsls.dev/at/${did}/${collection}`
}
