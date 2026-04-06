import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import {
  resolveDidFromIdentifier,
  resolveHandleFromDid,
  fetchFundAtRecords,
  fetchOwnFundAtRecords,
} from '@/lib/fund-at-records'
import { fetchPublicEndorsements } from '@/lib/pipeline/fetch-public-endorsements'
import { batchFetchProfiles } from '@/lib/identity'
import { buildIdentity } from '@/lib/steward-model'
import { lookupManualByIdentity } from '@/lib/funding'
import { mergeDeps } from '@/lib/merge-deps'
import { getSession } from '@/lib/auth/session'
import { ProfileClient } from '@/components/ProfileClient'
import type { StewardEntry } from '@/lib/steward-model'
import type { FundAtResult } from '@/lib/fund-at-records'

type Props = {
  params: Promise<{ identifier: string }>
  searchParams: Promise<{ edit?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { identifier } = await params
  const decoded = decodeURIComponent(identifier)
  // Use the identifier directly as the display name — no extra network calls
  const displayName = decoded.startsWith('did:')
    ? decoded.slice(0, 24) + '…'
    : decoded

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

  // ── Step 1: Resolve DID (the one required sequential call) ──────────
  let did: string | undefined
  if (decoded.startsWith('did:')) {
    did = decoded
  } else {
    did = await resolveDidFromIdentifier(decoded)
  }

  if (!did) {
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

  // ── Step 2: Determine viewer context ─────────────────────────────────
  const cookieStore = await cookies()
  const sessionDid = cookieStore.get('did')?.value
  const mightBeOwner = !!(sessionDid && sessionDid === did)

  // ── Step 3: Fetch everything in parallel ────────────────────────────
  const handlePromise = decoded.startsWith('did:')
    ? resolveHandleFromDid(did).catch(() => undefined)
    : Promise.resolve(decoded)

  const profilePromise = batchFetchProfiles([did]).catch(
    () => new Map() as Awaited<ReturnType<typeof batchFetchProfiles>>,
  )
  const fundingPromise = fetchFundAtRecords(did).catch(() => null)
  const endorsePromise = fetchPublicEndorsements(decoded).catch((): string[] => [])

  // Session validation + owner records in one chain (only if cookie matches).
  // getSession() validates the OAuth session; if valid, fetch owner records.
  const ownerPromise: Promise<{ session: boolean; existing: FundAtResult | null }> = mightBeOwner
    ? getSession()
        .then(async (s) => {
          if (!s || s.did !== did) return { session: false, existing: null }
          const existing = await fetchOwnFundAtRecords(s).catch(() => null)
          return { session: true, existing }
        })
        .catch(() => ({ session: false, existing: null }))
    : Promise.resolve({ session: false, existing: null })

  const [handle, profileMap, fundAtRecords, endorsedUris, ownerResult] =
    await Promise.all([
      handlePromise,
      profilePromise,
      fundingPromise,
      endorsePromise,
      ownerPromise,
    ])

  const isOwner = ownerResult.session
  const isViewer = !!(sessionDid && !isOwner)
  const viewMode: 'public' | 'viewer' | 'owner' = isOwner
    ? 'owner'
    : isViewer ? 'viewer' : 'public'
  const existing = ownerResult.existing

  // ── Step 4: Assemble StewardEntry locally (no network) ─────────────
  const profile = profileMap.get(did)
  const manual = lookupManualByIdentity({
    uri: handle ?? did,
    did,
    handle,
    displayName: profile?.displayName ?? handle ?? did,
  })
  const isTool = !decoded.startsWith('did:') && !!manual

  const identity = buildIdentity({
    ref: decoded,
    did,
    handle,
    displayName: profile?.displayName,
    description: profile?.description,
    avatar: profile?.avatar,
    isTool,
  })

  const entry: StewardEntry = {
    ...identity,
    source: fundAtRecords ? 'fund.at' : manual ? 'manual' : 'unknown',
    contributeUrl: fundAtRecords?.contributeUrl ?? manual?.contributeUrl,
    dependencies: mergeDeps(
      fundAtRecords?.dependencies?.map((d) => d.uri),
      manual?.dependencies,
    ),
    channels: fundAtRecords?.channels,
    plans: fundAtRecords?.plans,
    tags: isTool ? ['tool'] : [],
  }

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
