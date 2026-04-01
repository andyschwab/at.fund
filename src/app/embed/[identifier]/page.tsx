import type { Metadata } from 'next'
import {
  resolveDidFromIdentifier,
  resolveHandleFromDid,
  fetchFundAtRecords,
} from '@/lib/fund-at-records'
import { HeartHandshake } from 'lucide-react'

type Props = {
  params: Promise<{ identifier: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { identifier } = await params
  return {
    title: `Support ${identifier} — at.fund`,
    description: `Fund the builder behind ${identifier} on AT Protocol.`,
  }
}

async function resolveProfile(identifier: string): Promise<{
  did: string
  handle?: string
  contributeUrl?: string
} | null> {
  // If it looks like a DID, use it directly; otherwise resolve handle → DID
  let did: string
  if (identifier.startsWith('did:')) {
    did = identifier
  } else {
    const resolved = await resolveDidFromIdentifier(identifier)
    if (!resolved) return null
    did = resolved
  }

  const handle = identifier.startsWith('did:')
    ? await resolveHandleFromDid(did)
    : identifier

  const records = await fetchFundAtRecords(did)

  return {
    did,
    handle: handle ?? undefined,
    contributeUrl: records?.contributeUrl,
  }
}

export default async function EmbedPage({ params }: Props) {
  const { identifier } = await params
  const profile = await resolveProfile(decodeURIComponent(identifier))

  if (!profile) {
    return (
      <div style={styles.container}>
        <p style={styles.notFound}>Could not resolve {identifier}</p>
      </div>
    )
  }

  const displayName = profile.handle ?? profile.did
  const shortDid = profile.did.length > 24
    ? profile.did.slice(0, 24) + '\u2026'
    : profile.did

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.left}>
          <div style={styles.name}>{displayName}</div>
          {profile.handle && (
            <div style={styles.did}>{shortDid}</div>
          )}
        </div>
        <div style={styles.right}>
          {profile.contributeUrl ? (
            <a
              href={profile.contributeUrl}
              target="_blank"
              rel="noreferrer"
              style={styles.button}
            >
              Support
            </a>
          ) : (
            <span style={styles.noLink}>No funding link</span>
          )}
        </div>
      </div>
      <div style={styles.branding}>
        <HeartHandshake style={{ width: 12, height: 12, color: '#059669' }} strokeWidth={1.75} />
        <span>at.fund</span>
      </div>
    </div>
  )
}

// Inline styles so the embed is self-contained (no external CSS dependency)
const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '12px 16px',
    maxWidth: 320,
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 1.4,
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  left: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontWeight: 600,
    fontSize: 14,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  did: {
    fontSize: 11,
    color: '#64748b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    marginTop: 1,
  },
  right: {
    flexShrink: 0,
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 8,
    backgroundColor: '#059669',
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  },
  noLink: {
    fontSize: 12,
    color: '#94a3b8',
  },
  branding: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    fontSize: 10,
    color: '#94a3b8',
    letterSpacing: '0.02em',
  },
  notFound: {
    fontSize: 13,
    color: '#94a3b8',
  },
}
