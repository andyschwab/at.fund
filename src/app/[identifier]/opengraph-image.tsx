import { ImageResponse } from 'next/og'
import { Client } from '@atproto/lex'
import { xrpcQuery } from '@/lib/xrpc'
import { resolveDidFromIdentifier } from '@/lib/fund-at-records'
import { fetchPublicEndorsements } from '@/lib/pipeline/fetch-public-endorsements'
import { fetchFundAtRecords } from '@/lib/fund-at-records'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const revalidate = 86400

const PUBLIC_API = 'https://public.api.bsky.app'

type Props = {
  params: Promise<{ identifier: string }>
}

export default async function Image({ params }: Props) {
  const { identifier } = await params
  const decoded = decodeURIComponent(identifier)

  // Resolve identity
  let handle = decoded
  let did: string | undefined
  if (decoded.startsWith('did:')) {
    did = decoded
  } else {
    did = await resolveDidFromIdentifier(decoded)
  }

  let displayName = `@${handle}`
  let avatar: string | undefined
  let endorsementCount = 0
  let hasFunding = false

  const fetches: Promise<unknown>[] = []

  // Profile fetch
  const profileFetch = xrpcQuery<{
    profiles?: Array<{ handle?: string; displayName?: string; avatar?: string }>
  }>(new Client(PUBLIC_API), 'app.bsky.actor.getProfiles', { actors: [did ?? handle] })
  fetches.push(profileFetch)

  // Endorsements
  const endorseFetch = fetchPublicEndorsements(handle)
  fetches.push(endorseFetch)

  // Funding records
  if (did) {
    const fundingFetch = fetchFundAtRecords(did)
    fetches.push(fundingFetch)
  }

  const [profileResult, endorseResult, fundingResult] = await Promise.allSettled(fetches)

  if (profileResult.status === 'fulfilled') {
    const data = profileResult.value as { profiles?: Array<{ handle?: string; displayName?: string; avatar?: string }> }
    const profile = data.profiles?.[0]
    if (profile?.displayName) displayName = profile.displayName
    if (profile?.handle) handle = profile.handle
    if (profile?.avatar) avatar = profile.avatar
  }

  if (endorseResult.status === 'fulfilled') {
    endorsementCount = (endorseResult.value as string[]).length
  }

  if (fundingResult?.status === 'fulfilled') {
    const records = fundingResult.value as { contributeUrl?: string } | null
    hasFunding = !!records?.contributeUrl
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: '#059669',
          gap: 32,
          padding: '0 80px',
        }}
      >
        {/* at❤fund wordmark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'monospace',
            fontSize: 48,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.7)',
            letterSpacing: '-0.02em',
          }}
        >
          at❤fund
        </div>

        {/* Avatar + name */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
        >
          {avatar ? (
            <img
              src={avatar}
              width={96}
              height={96}
              style={{ borderRadius: 48, objectFit: 'cover' }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                color: 'white',
                fontWeight: 600,
              }}
            >
              {handle.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 56,
                fontWeight: 700,
                color: 'white',
                letterSpacing: '-0.02em',
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                fontSize: 28,
                color: 'rgba(255,255,255,0.7)',
              }}
            >
              @{handle}
            </div>
          </div>
        </div>

        {/* Status line */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 32,
            fontSize: 32,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)',
            letterSpacing: '-0.01em',
          }}
        >
          {hasFunding && <span>Accepting support</span>}
          {hasFunding && endorsementCount > 0 && <span style={{ color: 'rgba(255,255,255,0.5)' }}>·</span>}
          {endorsementCount > 0
            ? `${endorsementCount} project${endorsementCount === 1 ? '' : 's'} endorsed`
            : !hasFunding && 'at.fund profile'}
        </div>
      </div>
    ),
    { ...size },
  )
}
