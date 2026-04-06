import { ImageResponse } from 'next/og'
import { Client } from '@atproto/lex'
import { xrpcQuery } from '@/lib/xrpc'
import { fetchPublicEndorsements } from '@/lib/pipeline/fetch-public-endorsements'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
// Cache for 24 hours; stale-while-revalidate in the background
export const revalidate = 86400

const PUBLIC_API = 'https://public.api.bsky.app'

type Props = {
  params: Promise<{ handle: string }>
}

export default async function Image({ params }: Props) {
  const { handle } = await params

  // Run profile fetch and endorsement count lookup in parallel
  let displayName = `@${handle}`
  let avatar: string | undefined
  let count = 0

  const [profileResult, endorsedUris] = await Promise.allSettled([
    xrpcQuery<{
      profiles?: Array<{ handle?: string; displayName?: string; avatar?: string }>
    }>(new Client(PUBLIC_API), 'app.bsky.actor.getProfiles', { actors: [handle] }),
    fetchPublicEndorsements(handle),
  ])

  if (profileResult.status === 'fulfilled') {
    const profile = profileResult.value.profiles?.[0]
    if (profile?.displayName) displayName = profile.displayName
    if (profile?.avatar) avatar = profile.avatar
  }

  if (endorsedUris.status === 'fulfilled') {
    count = endorsedUris.value.length
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

        {/* Endorsement count */}
        <div
          style={{
            fontSize: 40,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.9)',
            letterSpacing: '-0.01em',
          }}
        >
          {count === 0
            ? 'No endorsed projects yet'
            : `${count} project${count === 1 ? '' : 's'} endorsed`}
        </div>
      </div>
    ),
    { ...size },
  )
}
