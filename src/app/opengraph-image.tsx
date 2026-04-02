import { ImageResponse } from 'next/og'

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
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            <path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08v0c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66" />
            <path d="m18 15-2-2" />
            <path d="m15 18-2-2" />
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
