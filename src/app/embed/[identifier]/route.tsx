import { resolveIdentity } from '@/lib/identity'
import { fetchFundAtRecords } from '@/lib/fund-at-records'
import { detectPlatform, PLATFORM_LABELS } from '@/lib/funding-manifest'
import type { FundingChannel, FundingPlan } from '@/lib/funding-manifest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function channelLabel(ch: FundingChannel): string {
  const platform = detectPlatform(ch.address)
  if (platform) return PLATFORM_LABELS[platform]
  if (ch.description) return ch.description
  try { return new URL(ch.address).hostname } catch { return 'Other' }
}

function formatAmount(amount: number, currency: string): string {
  if (amount === 0) return ''
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

function frequencyLabel(freq: string): string {
  switch (freq) {
    case 'one-time': return ''
    case 'weekly': return '/wk'
    case 'fortnightly': return '/2wk'
    case 'monthly': return '/mo'
    case 'yearly': return '/yr'
    default: return ''
  }
}

function linkable(channels: FundingChannel[]): FundingChannel[] {
  return channels.filter((ch) => {
    try { new URL(ch.address); return true } catch { return false }
  })
}

// ---------------------------------------------------------------------------
// Theme CSS
// ---------------------------------------------------------------------------

type Theme = 'light' | 'dark' | 'auto'

function themeStyles(theme: Theme): string {
  const light = `
    body{background:transparent;color:#1e293b}
    .card{border:1px solid #e2e8f0;background:#fff}
    .avatar-fallback{background:#d1fae5;color:#059669}
    .handle a:hover{color:#059669}
    .support-btn{background:#059669;color:#fff}
    .support-btn:hover{background:#047857}
    .ch{border-color:#a7f3d0;background:#ecfdf5;color:#047857}
    .ch:hover{background:#d1fae5;border-color:#6ee7b7}
    .ch-amt{color:#059669}`

  const dark = `
    body{background:transparent;color:#e2e8f0}
    .card{border:1px solid #334155;background:#0f172a}
    .avatar-fallback{background:#064e3b;color:#6ee7b7}
    .handle a:hover{color:#6ee7b7}
    .support-btn{background:#059669;color:#fff}
    .support-btn:hover{background:#047857}
    .ch{border-color:#065f46;background:#022c22;color:#6ee7b7}
    .ch:hover{background:#064e3b;border-color:#059669}
    .ch-amt{color:#34d399}`

  if (theme === 'light') return light
  if (theme === 'dark') return dark
  // auto: use prefers-color-scheme
  return `${light}\n    @media(prefers-color-scheme:dark){${dark}\n    }`
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ identifier: string }> },
) {
  const { identifier: rawId } = await params
  const identifier = decodeURIComponent(rawId)
  const url = new URL(request.url)
  const buttonLabel = url.searchParams.get('label') || 'Support'
  const rawTheme = url.searchParams.get('theme') || 'auto'
  const theme: Theme = ['light', 'dark', 'auto'].includes(rawTheme) ? rawTheme as Theme : 'auto'

  // Resolve identity, then funding
  const identity = await resolveIdentity(identifier)
  const records = identity ? await fetchFundAtRecords(identity.did) : null

  const handle = identity?.handle ?? identifier
  const avatar = identity?.avatar
  const contributeUrl = records?.contributeUrl
  const channels = linkable(records?.channels ?? [])
  const bskyUrl = `https://bsky.app/profile/${esc(handle)}`

  // Index plans by channel GUID for amount display
  const planByChannel = new Map<string, FundingPlan>()
  for (const plan of records?.plans ?? []) {
    if (plan.status !== 'active') continue
    for (const chRef of plan.channels) {
      const slug = chRef.includes('/') ? chRef.split('/').pop()! : chRef
      planByChannel.set(slug, plan)
    }
  }

  // Build channel link HTML
  const channelLinksHtml = channels.map((ch) => {
    const plan = planByChannel.get(ch.guid)
    const amt = plan && plan.amount > 0 ? formatAmount(plan.amount, plan.currency) : ''
    const freq = plan ? frequencyLabel(plan.frequency) : ''
    const amtHtml = amt
      ? `<span class="ch-amt">${esc(amt)}${esc(freq)}</span>`
      : ''
    return `<a href="${esc(ch.address)}" target="_blank" rel="noreferrer" class="ch">${esc(channelLabel(ch))}${amtHtml}</a>`
  }).join('\n          ')

  // Avatar: real image or initials fallback
  const initial = handle.charAt(0).toUpperCase()
  const avatarHtml = avatar
    ? `<img src="${esc(avatar)}" alt="" class="avatar" />`
    : `<div class="avatar avatar-fallback">${esc(initial)}</div>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(buttonLabel)} @${esc(handle)} — at.fund</title>
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    a{color:inherit;text-decoration:none;cursor:pointer}

    .card{
      display:flex;align-items:flex-start;gap:10px;
      padding:10px 12px;border-radius:12px;
      box-shadow:0 1px 3px rgba(0,0,0,0.08);
    }

    .avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;object-fit:cover}
    .avatar-fallback{display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px}

    .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}

    .handle{font-size:13px;font-weight:500;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .handle a{transition:color .15s}

    .support-btn{
      display:inline-flex;align-items:center;justify-content:center;
      padding:5px 16px;border-radius:8px;
      font-size:12px;font-weight:600;white-space:nowrap;
      transition:background .15s;align-self:flex-start;
    }
    .support-btn.muted{opacity:.65}

    .channels{display:flex;flex-wrap:wrap;gap:4px}
    .ch{
      display:inline-flex;align-items:center;gap:3px;
      padding:2px 8px;border-radius:9999px;
      font-size:10px;font-weight:500;white-space:nowrap;
      transition:background .15s,border-color .15s;
      border-width:1px;border-style:solid;
    }
    .ch-amt{font-weight:600}
    ${themeStyles(theme)}
  </style>
</head>
<body>
  <div class="card">
    ${avatarHtml}
    <div class="body">
      <div class="handle"><a href="${bskyUrl}" target="_blank" rel="noreferrer">@${esc(handle)}</a></div>
      ${contributeUrl
        ? `<a href="${esc(contributeUrl)}" target="_blank" rel="noreferrer" class="support-btn">${esc(buttonLabel)}</a>`
        : `<span class="support-btn muted">${esc(buttonLabel)}</span>`
      }
      ${channels.length > 0
        ? `<div class="channels">
          ${channelLinksHtml}
        </div>`
        : ''
      }
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
