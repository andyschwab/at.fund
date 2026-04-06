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

  // Resolve identity, then funding
  const identity = await resolveIdentity(identifier)
  const records = identity ? await fetchFundAtRecords(identity.did) : null

  const displayName = identity?.displayName ?? identifier
  const handle = identity?.handle
  const avatar = identity?.avatar
  const contributeUrl = records?.contributeUrl
  const channels = linkable(records?.channels ?? [])
  const profileUrl = `https://at.fund/${esc(handle ?? identifier)}`

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
  const initial = displayName.charAt(0).toUpperCase()
  const avatarHtml = avatar
    ? `<img src="${esc(avatar)}" alt="" class="avatar" />`
    : `<div class="avatar avatar-fallback">${esc(initial)}</div>`

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${esc(buttonLabel)} ${esc(displayName)} — at.fund</title>
  <style>
    *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:transparent;color:#1e293b}
    a{color:inherit;text-decoration:none}

    .card{
      display:flex;
      align-items:flex-start;
      gap:10px;
      padding:10px 14px;
    }

    .avatar{
      width:36px;height:36px;border-radius:50%;flex-shrink:0;
      object-fit:cover;
    }
    .avatar-fallback{
      display:flex;align-items:center;justify-content:center;
      background:#d1fae5;color:#059669;font-weight:700;font-size:14px;
    }

    .body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}

    .name{
      font-size:13px;font-weight:600;line-height:1.2;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
    }
    .name a:hover{color:#059669}

    .support-btn{
      display:inline-flex;align-items:center;justify-content:center;
      padding:5px 16px;border-radius:8px;
      background:#059669;color:#fff;
      font-size:12px;font-weight:600;white-space:nowrap;
      transition:background .15s;
      align-self:flex-start;
    }
    .support-btn:hover{background:#047857}
    .support-btn.disabled{opacity:.45;cursor:default}

    .channels{display:flex;flex-wrap:wrap;gap:4px}
    .ch{
      display:inline-flex;align-items:center;gap:3px;
      padding:2px 8px;border-radius:9999px;
      border:1px solid #a7f3d0;background:#ecfdf5;
      color:#047857;font-size:10px;font-weight:500;white-space:nowrap;
      transition:background .15s,border-color .15s;
    }
    .ch:hover{background:#d1fae5;border-color:#6ee7b7}
    .ch-amt{color:#059669;font-weight:600}
  </style>
</head>
<body>
  <div class="card">
    ${avatarHtml}
    <div class="body">
      <div class="name"><a href="${profileUrl}" target="_blank" rel="noreferrer">${esc(displayName)}</a></div>
      ${contributeUrl
        ? `<a href="${esc(contributeUrl)}" target="_blank" rel="noreferrer" class="support-btn">${esc(buttonLabel)}</a>`
        : `<span class="support-btn disabled">${esc(buttonLabel)}</span>`
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
