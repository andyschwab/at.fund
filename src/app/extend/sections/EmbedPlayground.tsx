'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  buildProfileLinkHtml,
  type BadgeSize,
  type BadgeStyle,
} from '@/lib/profile-link-badge'
import { CopyButton, CodeBlock } from '../ui'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODES = ['Support button', 'Profile link'] as const
type EmbedMode = (typeof MODES)[number]

const THEMES = ['Light', 'Dark', 'Auto'] as const
const BADGE_STYLES: { id: BadgeStyle; label: string }[] = [
  { id: 'inline', label: 'Inline' },
  { id: 'circle', label: 'Circle badge' },
]
const BADGE_SIZES: BadgeSize[] = [16, 18, 20, 24]

const INPUT_CLASS =
  'w-full max-w-xs rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-sm text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder-slate-500'

const PILL_ACTIVE = 'bg-[var(--support)] text-white'
const PILL_INACTIVE =
  'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'

const DIRECT_PDS_SNIPPET = [
  '// Fetch fund.at data directly from the AT Protocol network.',
  '// Uses the Bluesky AppView as a public resolver — any compatible endpoint works.',
  '',
  'async function getFundingInfo(handle) {',
  '  // 1. Resolve handle → DID',
  '  const resolve = await fetch(',
  '    `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`',
  '  )',
  '  const { did } = await resolve.json()',
  '',
  '  // 2. Resolve DID → PDS URL (from DID document)',
  '  const plcRes = await fetch(`https://plc.directory/${did}`)',
  '  const didDoc = await plcRes.json()',
  "  const pds = didDoc.service?.find(s => s.id === '#atproto_pds')?.serviceEndpoint",
  '',
  '  // 3. Fetch the funding record from their PDS',
  '  const record = await fetch(',
  '    `${pds}/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=fund.at.funding.contribute&rkey=self`',
  '  )',
  '  const { value } = await record.json()',
  '',
  '  return { did, pds, contributeUrl: value?.url }',
  '}',
  '',
  "// Usage",
  "const info = await getFundingInfo('atprotocol.dev')",
  'console.log(info.contributeUrl) // "https://..."',
].join('\n')

const IFRAME_CSS = 'border: none; border-radius: 12px; width: 260px; height: 120px;'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmbedPlayground() {
  const [mode, setMode] = useState<EmbedMode>('Support button')
  const [handle, setHandle] = useState('atprotocol.dev')
  const [buttonLabel, setButtonLabel] = useState('Support')
  const [theme, setTheme] = useState<(typeof THEMES)[number]>('Auto')
  const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>('inline')
  const [badgeSize, setBadgeSize] = useState<BadgeSize>(18)
  const [iframeKey, setIframeKey] = useState(0)
  const [mounted, setMounted] = useState(false)

  const [stewardData, setStewardData] = useState<string | null>(null)
  const [stewardLoading, setStewardLoading] = useState(false)

  const reload = useCallback(() => setIframeKey((k) => k + 1), [])

  useEffect(() => { setMounted(true) }, [])

  const fetchSteward = useCallback(async (h: string) => {
    const trimmed = h.trim()
    if (!trimmed) { setStewardData(null); return }
    setStewardLoading(true)
    try {
      const res = await fetch(`/api/steward?uri=${encodeURIComponent(trimmed)}`)
      const text = await res.text()
      try {
        setStewardData(JSON.stringify(JSON.parse(text), null, 2))
      } catch {
        setStewardData(text)
      }
    } catch (e) {
      setStewardData(`Error: ${(e as Error).message}`)
    } finally {
      setStewardLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchSteward(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCommit() {
    reload()
    void fetchSteward(handle)
  }

  const trimmedHandle = handle.trim()

  const qp = new URLSearchParams()
  if (buttonLabel && buttonLabel !== 'Support') qp.set('label', buttonLabel)
  if (theme !== 'Auto') qp.set('theme', theme.toLowerCase())
  const qs = qp.toString()
  const embedPath = trimmedHandle ? `/embed/${trimmedHandle}${qs ? `?${qs}` : ''}` : ''
  const publicSrc = embedPath ? `https://at.fund${embedPath}` : ''

  const embedHtml = publicSrc
    ? `<iframe\n  src="${publicSrc}"\n  style="${IFRAME_CSS}"\n  title="Support on at.fund"\n></iframe>`
    : ''

  const profileLinkHtml = useMemo(
    () => buildProfileLinkHtml(trimmedHandle, { style: badgeStyle, size: badgeSize }),
    [trimmedHandle, badgeStyle, badgeSize],
  )

  const profileLinkPreviewHtml = useMemo(
    () => buildProfileLinkHtml(trimmedHandle, {
      style: badgeStyle,
      size: badgeSize,
      baseUrl: mounted && typeof window !== 'undefined' ? window.location.origin : 'https://at.fund',
    }),
    [trimmedHandle, badgeStyle, badgeSize, mounted],
  )

  const isIframeMode = mode === 'Support button'

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex flex-wrap gap-1">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              m === mode ? PILL_ACTIVE : PILL_INACTIVE
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Live preview */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Live preview
        </p>
        <div className="flex min-h-[140px] items-start justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/30">
          {isIframeMode ? (
            mounted && embedPath ? (
              <iframe
                key={iframeKey}
                src={embedPath}
                style={{ border: 'none', borderRadius: 12, width: 260, height: 120 }}
                title="Support on at.fund"
              />
            ) : (
              <p className="text-sm text-slate-400">
                {embedPath ? 'Loading preview…' : 'Enter a handle to see the preview'}
              </p>
            )
          ) : trimmedHandle && profileLinkPreviewHtml ? (
            <div className="text-center">
              <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
                Example credits row — only the icon links to at.fund
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                <span className="text-[var(--support)] underline decoration-[var(--support-border)] underline-offset-2">
                  Project homepage
                </span>
                <span
                  dangerouslySetInnerHTML={{ __html: profileLinkPreviewHtml }}
                />
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Enter a handle to see the preview</p>
          )}
        </div>
      </div>

      {/* Config inputs */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
            Handle
          </label>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={(e) => e.key === 'Enter' && handleCommit()}
            placeholder="handle, DID, or hostname"
            spellCheck={false}
            className={INPUT_CLASS}
          />
        </div>

        {isIframeMode ? (
          <>
            <div className="flex items-center gap-2">
              <label className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                Button label
              </label>
              <input
                type="text"
                value={buttonLabel}
                onChange={(e) => setButtonLabel(e.target.value)}
                onBlur={reload}
                onKeyDown={(e) => e.key === 'Enter' && reload()}
                placeholder="Support"
                spellCheck={false}
                className={`${INPUT_CLASS} max-w-[140px]`}
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                Theme
              </label>
              <div className="flex gap-1">
                {THEMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setTheme(t); reload() }}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      t === theme ? PILL_ACTIVE : PILL_INACTIVE
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <label className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                Style
              </label>
              <div className="flex gap-1">
                {BADGE_STYLES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setBadgeStyle(s.id)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      s.id === badgeStyle ? PILL_ACTIVE : PILL_INACTIVE
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
                Size
              </label>
              <div className="flex gap-1">
                {BADGE_SIZES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setBadgeSize(s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      s === badgeSize ? PILL_ACTIVE : PILL_INACTIVE
                    }`}
                  >
                    {s}px
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Profile link usage note */}
      {!isIframeMode && (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          For credits or attribution pages: keep your primary link pointing at source code or a
          project homepage, then add this icon when the steward has an at.fund profile worth
          linking. The icon opens their full funding profile — not Bluesky, and not a direct
          payment link.
        </p>
      )}

      {/* Embed / profile link code */}
      {(isIframeMode ? embedHtml : profileLinkHtml) && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {isIframeMode ? 'Embed code' : 'HTML snippet'}
            </p>
            <CopyButton
              text={isIframeMode ? embedHtml : profileLinkHtml}
              label="Copy HTML"
            />
          </div>
          <pre className="overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300">
            {isIframeMode ? embedHtml : profileLinkHtml}
          </pre>
        </div>
      )}

      {/* Steward data — iframe mode only */}
      {isIframeMode && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Steward data
            </p>
            <code className="text-[11px] text-slate-400 dark:text-slate-500">
              GET /api/steward?uri={trimmedHandle || '…'}
            </code>
            {stewardLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          </div>
          {stewardData && (
            <div className="group relative">
              <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                <CopyButton text={stewardData} label="Copy" />
              </div>
              <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200">
                {stewardData}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Direct PDS snippet — iframe mode only */}
      {isIframeMode && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Direct from the PDS
          </p>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            You can fetch fund.at records directly from the AT Protocol network.
            Each record is stored on the user&apos;s own PDS.
          </p>
          <CodeBlock code={DIRECT_PDS_SNIPPET} language="javascript" />
        </div>
      )}
    </div>
  )
}
