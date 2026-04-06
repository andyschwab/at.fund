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

  const handle = profile?.handle ?? decodeURIComponent(identifier)
  const profileUrl = `https://at.fund/${esc(handle)}`
  const channels = profile ? linkableChannels(profile.channels) : []

  // Build channel pills HTML
  const channelPillsHtml = channels.map((ch) =>
    `<a href="${esc(ch.address)}" target="_blank" rel="noreferrer" class="channel-pill">${esc(channelLabel(ch))}</a>`
  ).join('\n            ')

  const hasChannels = channels.length > 0

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(buttonLabel)} ${esc(handle)} — at.fund</title>
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
      gap: 6px;
      padding: 12px 16px;
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
    .handle-link {
      font-size: 11px;
      color: #64748b;
      text-decoration: none;
      transition: color 0.15s;
    }
    .handle-link:hover { color: #059669; text-decoration: underline; }
    .channels-dropdown {
      display: none;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px 0 2px;
      justify-content: center;
    }
    .channels-dropdown.open { display: flex; }
    .channel-pill {
      display: inline-flex;
      align-items: center;
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
    .branding {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 9px;
      color: #94a3b8;
      letter-spacing: 0.02em;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="embed">
    <div class="button-row">
      ${profile?.contributeUrl
        ? `<a href="${esc(profile.contributeUrl)}" target="_blank" rel="noreferrer" class="support-btn">${esc(buttonLabel)}</a>`
        : `<span class="support-btn" style="opacity:0.5;cursor:default">${esc(buttonLabel)}</span>`
      }${hasChannels
        ? `<button type="button" class="channels-toggle" aria-expanded="false" aria-label="Show funding channels" onclick="var d=this.parentElement.nextElementSibling.nextElementSibling;var open=d.classList.toggle('open');this.setAttribute('aria-expanded',open)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>`
        : ''
      }
    </div>
    <a href="${profileUrl}" target="_blank" rel="noreferrer" class="handle-link">@${esc(handle)}</a>
    ${hasChannels
      ? `<div class="channels-dropdown">
            ${channelPillsHtml}
          </div>`
      : ''
    }
    <div class="branding">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66"/><path d="m18 15-2-2"/><path d="m15 18-2-2"/></svg>
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
