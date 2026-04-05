import type { Metadata } from 'next'
import Link from 'next/link'
import { cookies } from 'next/headers'
import { Client } from '@atproto/lex'
import { Share2 } from 'lucide-react'
import { xrpcQuery } from '@/lib/xrpc'
import { fetchPublicEndorsements } from '@/lib/pipeline/fetch-public-endorsements'
import { StackStream } from './StackStream'

const PUBLIC_API = 'https://public.api.bsky.app'

type Props = {
  params: Promise<{ handle: string }>
}

type BlueskyProfile = {
  did?: string
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
    description: `Projects endorsed by @${handle} on at.fund`,
    openGraph: {
      title: `${handle}'s stack — at.fund`,
      description: `Projects endorsed by @${handle} on at.fund`,
      images: [{ url: `/stack/${handle}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function StackPage({ params }: Props) {
  const { handle } = await params

  const cookieStore = await cookies()
  const sessionDid = cookieStore.get('did')?.value

  const [profile, endorsedUris] = await Promise.all([
    fetchBlueskyProfile(handle),
    fetchPublicEndorsements(handle),
  ])

  const displayHandle = profile?.handle ?? handle
  const displayName = profile?.displayName ?? `@${displayHandle}`
  const avatar = profile?.avatar
  const count = endorsedUris.length
  const isSelf = !!(sessionDid && profile?.did && sessionDid === profile.did)

  const stackUrl = `https://at.fund/stack/${handle}`
  const countPhrase = count > 0
    ? `${count} project${count === 1 ? '' : 's'} endorsed`
    : 'stack'
  const shareText = isSelf
    ? `Check out my stack on @at.fund — ${countPhrase} ❤️\n${stackUrl}`
    : `Check out @${displayHandle}'s stack on @at.fund — ${countPhrase} ❤️\n${stackUrl}`
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

        {/* Entry list — streams entries client-side after fast initial render */}
        <StackStream handle={handle} />

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
