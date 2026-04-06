import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { resolveDidFromIdentifier, resolveHandleFromDid, fetchFundAtRecords, fetchOwnFundAtRecords } from '@/lib/fund-at-records'
import { fetchPublicEndorsements } from '@/lib/pipeline/fetch-public-endorsements'
import { resolveEntry } from '@/lib/pipeline/entry-resolve'
import { getSession } from '@/lib/auth/session'
import { ProfileClient } from '@/components/ProfileClient'
import type { StewardEntry } from '@/lib/steward-model'
import type { FundAtResult } from '@/lib/fund-at-records'

type Props = {
  params: Promise<{ identifier: string }>
  searchParams: Promise<{ edit?: string }>
}

async function resolveProfile(identifier: string) {
  // Resolve DID from handle, DID, or hostname
  let did: string | undefined
  if (identifier.startsWith('did:')) {
    did = identifier
  } else {
    did = await resolveDidFromIdentifier(identifier)
  }
  if (!did) return null

  const handle = identifier.startsWith('did:')
    ? await resolveHandleFromDid(did).catch(() => undefined)
    : identifier

  return { did, handle }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { identifier } = await params
  const decoded = decodeURIComponent(identifier)
  const profile = await resolveProfile(decoded)
  const displayName = profile?.handle ?? decoded

  return {
    title: `${displayName} — at.fund`,
    description: `Support ${displayName} on at.fund — funding for the Atmosphere.`,
    openGraph: {
      title: `${displayName} — at.fund`,
      description: `Support ${displayName} on at.fund — funding for the Atmosphere.`,
      images: [{ url: `/${identifier}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image' },
  }
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { identifier } = await params
  const { edit } = await searchParams
  const decoded = decodeURIComponent(identifier)

  const profile = await resolveProfile(decoded)
  if (!profile) {
    return (
      <div className="page-wash min-h-full">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-4 py-16 text-center">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Not found
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Could not resolve <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{decoded}</code> to an AT Protocol identity.
          </p>
        </div>
      </div>
    )
  }

  const { did, handle } = profile

  // Determine viewer context
  const cookieStore = await cookies()
  const sessionDid = cookieStore.get('did')?.value
  const isOwner = !!(sessionDid && sessionDid === did)
  const isViewer = !!(sessionDid && sessionDid !== did)
  const viewMode: 'public' | 'viewer' | 'owner' = isOwner ? 'owner' : isViewer ? 'viewer' : 'public'

  // Fetch public data in parallel
  const [entryResult, endorsedUris] = await Promise.all([
    resolveEntry(handle ?? did).catch((): { entry: StewardEntry; referenced: StewardEntry[] } | null => null),
    fetchPublicEndorsements(handle ?? did).catch((): string[] => []),
  ])

  // For owner mode, also fetch existing records for editing
  let existing: FundAtResult | null = null
  if (isOwner) {
    try {
      const session = await getSession()
      if (session) {
        existing = await fetchOwnFundAtRecords(session).catch(() => null)
      }
    } catch { /* best-effort */ }
  }

  const entry = entryResult?.entry ?? null

  return (
    <ProfileClient
      viewMode={viewMode}
      entry={entry}
      endorsedUris={endorsedUris}
      handle={handle ?? did}
      did={did}
      existing={existing}
      initialEdit={edit === 'true'}
    />
  )
}
