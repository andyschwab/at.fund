import {
  resolveDidFromIdentifier,
  resolveHandleFromDid,
  fetchFundAtRecords,
} from '@/lib/fund-at-records'
import { detectPlatform, PLATFORM_LABELS } from '@/lib/funding-manifest'
import type { FundingChannel, FundingPlan } from '@/lib/funding-manifest'

type ResolvedProfile = {
  did: string
  handle?: string
  contributeUrl?: string
  channels: FundingChannel[]
  plans: FundingPlan[]
}

async function resolveProfile(identifier: string): Promise<ResolvedProfile | null> {
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
    channels: records?.channels ?? [],
    plans: records?.plans ?? [],
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
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
    return new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
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

function linkableChannels(channels: FundingChannel[]): FundingChannel[] {
  return channels.filter((ch) => { try { new URL(ch.address); return true } catch { return false } })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ identifier: string }> }
) {
  const { identifier } = await params
  const url = new URL(request.url)
  const buttonLabel = url.searchParams.get('label') || 'Support'
  const profile = await resolveProfile(decodeURIComponent(identifier))

  const channels = profile ? linkableChannels(profile.channels) : []

  // Index plans by channel GUID
  const planByChannel = new Map<string, FundingPlan>()
  for (const plan of profile?.plans ?? []) {
    if (plan.status !== 'active') continue
    for (const chRef of plan.channels) {
      const slug = chRef.includes('/') ? chRef.split('/').pop()! : chRef
      planByChannel.set(slug, plan)
    }
  }

  // Build channel pills with platform label + amount
  const channelPillsHtml = channels.map((ch) => {
    const plan = planByChannel.get(ch.guid)
    const amt = plan && plan.amount > 0 ? formatAmount(plan.amount, plan.currency) : ''
    const freq = plan ? frequencyLabel(plan.frequency) : ''
    const amtHtml = amt ? ` <span class="channel-amt">${esc(amt)}${esc(freq)}</span>` : ''
    return `<a href="${esc(ch.address)}" target="_blank" rel="noreferrer" class="channel-pill">${esc(channelLabel(ch))}${amtHtml}</a>`
  }).join('\n            ')

  const hasChannels = channels.length > 0

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(buttonLabel)} — at.fund</title>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: transparent;
    }
    .embed {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 12px;
    }
    .button-row {
      display: inline-flex;
      align-items: stretch;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .support-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 20px;
      background: #059669;
      color: #fff;
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
      border: none;
      cursor: pointer;
      transition: background 0.15s;
    }
    .support-btn:hover { background: #047857; }
    .support-btn:only-child { border-radius: 10px; }
    .channels-toggle {
      display: inline-flex;
      align-items: center;
      padding: 8px 10px;
      background: #047857;
      color: #fff;
      font-size: 11px;
      border: none;
      border-left: 1px solid rgba(255,255,255,0.2);
      cursor: pointer;
      transition: background 0.15s;
    }
    .channels-toggle:hover { background: #065f46; }
    .channels-toggle svg { transition: transform 0.15s; }
    .channels-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
    .channels-dropdown {
      display: none;
      flex-wrap: wrap;
      gap: 5px;
      padding: 8px 0 2px;
      justify-content: center;
    }
    .channels-dropdown.open { display: flex; }
    .channel-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: 9999px;
      border: 1px solid #a7f3d0;
      background: #ecfdf5;
      color: #047857;
      font-size: 11px;
      font-weight: 500;
      text-decoration: none;
      white-space: nowrap;
      transition: background 0.15s, border-color 0.15s;
    }
    .channel-pill:hover { background: #d1fae5; border-color: #6ee7b7; }
    .channel-amt { color: #059669; font-weight: 600; }
  </style>
</head>
<body>
  <div class="embed">
    <div class="button-row">
      ${profile?.contributeUrl
        ? `<a href="${esc(profile.contributeUrl)}" target="_blank" rel="noreferrer" class="support-btn">${esc(buttonLabel)}</a>`
        : `<span class="support-btn" style="opacity:0.5;cursor:default">${esc(buttonLabel)}</span>`
      }${hasChannels
        ? `<button type="button" class="channels-toggle" aria-expanded="false" aria-label="Show funding channels" onclick="var d=this.parentElement.nextElementSibling;var open=d.classList.toggle('open');this.setAttribute('aria-expanded',open)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>`
        : ''
      }
    </div>
    ${hasChannels
      ? `<div class="channels-dropdown">
            ${channelPillsHtml}
          </div>`
      : ''
    }
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
