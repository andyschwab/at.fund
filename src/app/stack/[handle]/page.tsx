import type { Metadata } from 'next'
import Link from 'next/link'
import { Client } from '@atproto/lex'
import { Share2 } from 'lucide-react'
import { fetchPublicEndorsements } from '@/lib/pipeline/fetch-public-endorsements'
import { resolveEntry } from '@/lib/pipeline/entry-resolve'
import { resolveDependencies } from '@/lib/pipeline/dep-resolve'
import { resolveDidFromIdentifier } from '@/lib/fund-at-records'
import { createScanContext } from '@/lib/scan-context'
import { xrpcQuery } from '@/lib/xrpc'
import { StackEntriesList } from './StackEntriesList'
import type { StewardEntry } from '@/lib/steward-model'

const PUBLIC_API = 'https://public.api.bsky.app'

type Props = {
  params: Promise<{ handle: string }>
}

type BlueskyProfile = {
  did: string
  handle?: string
  displayName?: string
  avatar?: string
}

async function fetchBlueskyProfile(identifier: string): Promise<BlueskyProfile | null> {
  try {
    const publicClient = new Client(PUBLIC_API)
    const data = await xrpcQuery<{ profiles?: BlueskyProfile[] }>(
      publicClient,
      'app.bsky.actor.getProfiles',
      { actors: [identifier] },
    )
    return data.profiles?.[0] ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  return {
    title: `${handle}'s stack — at.fund`,
    description: `Open source projects endorsed by @${handle} on at.fund`,
  }
}

export default async function StackPage({ params }: Props) {
  const { handle } = await params

  const [endorsedUris, , profile] = await Promise.all([
    fetchPublicEndorsements(handle),
    resolveDidFromIdentifier(handle),
    fetchBlueskyProfile(handle),
  ])

  // Resolve entries, capped at 30
  const sharedCtx = createScanContext()
  const urisToResolve = endorsedUris.slice(0, 30)
  const results = await Promise.allSettled(urisToResolve.map((uri) => resolveEntry(uri, sharedCtx)))
  const entries: StewardEntry[] = results
    .filter((r): r is PromiseFulfilledResult<{ entry: StewardEntry; referenced: StewardEntry[] }> => r.status === 'fulfilled')
    .map((r) => r.value.entry)

  // Resolve dependencies for all entries together in one BFS pass so the
  // lookup used by sub-icons is complete (shared ctx reuses cached fund.at records).
  const allReferenced = await resolveDependencies(entries, undefined, sharedCtx)

  const displayHandle = profile?.handle ?? handle
  const displayName = profile?.displayName ?? `@${displayHandle}`
  const avatar = profile?.avatar

  const stackUrl = `https://at.fund/stack/${handle}`
  const shareText = entries.length > 0
    ? `I've endorsed ${entries.length} project${entries.length === 1 ? '' : 's'} that fund the Atmosphere on @at.fund ❤️\n${stackUrl}`
    : `Check out my stack on @at.fund ❤️\n${stackUrl}`
  const bskyShareUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(shareText)}`

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            {avatar ? (
              <img
                src={avatar}
                alt={displayName}
                className="h-14 w-14 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <span className="text-xl font-semibold">{displayHandle.slice(0, 1).toUpperCase()}</span>
              </div>
            )}
            <div>
              <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{displayName}</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">@{displayHandle}</p>
              {entries.length > 0 && (
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                  {entries.length} project{entries.length === 1 ? '' : 's'} endorsed
                </p>
              )}
            </div>
          </div>

          <a
            href={bskyShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#0085ff] px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Share2 className="h-4 w-4 shrink-0" aria-hidden />
            Share on Bluesky
          </a>
        </div>

        {/* Entry list */}
        {entries.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white/60 p-8 text-center dark:border-slate-700/60 dark:bg-slate-900/40">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No endorsed projects found for @{displayHandle}.
            </p>
          </div>
        ) : (
          <StackEntriesList entries={entries} allEntries={[...entries, ...allReferenced]} />
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-600">
          Endorsements are public ATProto records.{' '}
          <Link href="/" className="underline hover:text-slate-600 dark:hover:text-slate-400">
            Discover your own stack at at.fund
          </Link>
        </p>

      </div>
    </div>
  )
}
