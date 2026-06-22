import { ImageResponse } from 'next/og'
import { HEART_HANDSHAKE_PATHS } from '@/lib/profile-link-badge'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
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
          gap: 24,
        }}
      >
        {/* at❤fund wordmark */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontFamily: 'monospace',
            fontSize: 96,
            fontWeight: 500,
            color: 'white',
            letterSpacing: '-0.02em',
            gap: 0,
          }}
        >
          <span>at</span>
          {/* Heart symbol representing HeartHandshake */}
          <svg
            viewBox="0 0 24 24"
            width={80}
            height={80}
            fill="none"
            stroke="white"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ margin: '0 8px', flexShrink: 0 }}
          >
            <path d={HEART_HANDSHAKE_PATHS[0]} />
            <path d={HEART_HANDSHAKE_PATHS[1]} />
            <path d={HEART_HANDSHAKE_PATHS[2]} />
            <path d={HEART_HANDSHAKE_PATHS[3]} />
          </svg>
          <span>fund</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 36,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.9)',
            letterSpacing: '-0.01em',
          }}
        >
          We can just pay for things
        </div>

        {/* Sub-tagline */}
        <div
          style={{
            fontSize: 22,
            color: 'rgba(255,255,255,0.65)',
            marginTop: -8,
          }}
        >
          No VCs, no ads — builders paid directly for the work you rely on
        </div>
      </div>
    ),
    { ...size },
  )
}
