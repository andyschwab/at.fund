import {
  resolveDidFromIdentifier,
  resolveHandleFromDid,
  fetchFundAtRecords,
} from '@/lib/fund-at-records'

async function resolveProfile(identifier: string): Promise<{
  did: string
  handle?: string
  contributeUrl?: string
} | null> {
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

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ identifier: string }> }
) {
  const { identifier } = await params
  const profile = await resolveProfile(decodeURIComponent(identifier))

  const displayName = profile?.handle ?? profile?.did ?? identifier
  const shortDid = profile
    ? profile.did.length > 24
      ? profile.did.slice(0, 24) + '\u2026'
      : profile.did
    : ''

  const buttonHtml = profile?.contributeUrl
    ? `<a href="${escapeHtml(profile.contributeUrl)}" target="_blank" rel="noreferrer" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;background:#059669;color:#fff;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap">Support</a>`
    : profile
      ? `<span style="font-size:12px;color:#94a3b8">No funding link</span>`
      : `<span style="font-size:12px;color:#94a3b8">Could not resolve</span>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Support ${escapeHtml(identifier)} — at.fund</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: transparent; }
  </style>
</head>
<body>
  <div style="padding:12px 16px;max-width:320px;font-size:14px;color:#1e293b;line-height:1.4">
    <div style="display:flex;align-items:center;gap:12px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(displayName)}</div>
        ${profile?.handle ? `<div style="font-size:11px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:1px">${escapeHtml(shortDid)}</div>` : ''}
      </div>
      <div style="flex-shrink:0">${buttonHtml}</div>
    </div>
    <div style="display:flex;align-items:center;gap:4px;margin-top:8px;font-size:10px;color:#94a3b8;letter-spacing:0.02em">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/></svg>
      <span>at.fund</span>
    </div>
  </div>
</body>
</html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'X-Frame-Options': 'ALLOWALL',
    },
  })
}
