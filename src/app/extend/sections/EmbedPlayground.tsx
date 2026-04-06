'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { CopyButton } from '../ui'

// ---------------------------------------------------------------------------
// Presets — sized for the compact button-only embed
// ---------------------------------------------------------------------------

type Preset = { label: string; css: string }

const PRESETS: Preset[] = [
  {
    label: 'Default',
    css: `border: none;
width: 200px;
height: 60px;`,
  },
  {
    label: 'Card',
    css: `border: 1px solid #e2e8f0;
border-radius: 12px;
width: 220px;
height: 64px;
box-shadow: 0 1px 3px rgba(0,0,0,0.08);`,
  },
  {
    label: 'Dark',
    css: `border: 1px solid #334155;
border-radius: 12px;
width: 220px;
height: 64px;
background: #0f172a;`,
  },
  {
    label: 'Full width',
    css: `border: none;
width: 100%;
max-width: 300px;
height: 60px;`,
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const INPUT_CLASS =
  'w-full max-w-xs rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-sm text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder-slate-500'

export function EmbedPlayground() {
  const [handle, setHandle] = useState('blacksky.app')
  const [buttonLabel, setButtonLabel] = useState('Support')
  const [activePreset, setActivePreset] = useState(0)
  const [customCss, setCustomCss] = useState(PRESETS[0].css)
  const [iframeKey, setIframeKey] = useState(0)

  // Raw steward data
  const [stewardData, setStewardData] = useState<string | null>(null)
  const [stewardLoading, setStewardLoading] = useState(false)

  function selectPreset(i: number) {
    setActivePreset(i)
    setCustomCss(PRESETS[i].css)
  }

  const reload = useCallback(() => setIframeKey((k) => k + 1), [])

  // Fetch steward data when handle changes
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

  // Fetch on initial mount
  useEffect(() => {
    void fetchSteward(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleCommit() {
    reload()
    void fetchSteward(handle)
  }

  // Convert textarea CSS to a style object for the iframe
  const iframeStyle: Record<string, string> = {}
  customCss.split('\n').forEach((line) => {
    const [prop, ...rest] = line.split(':')
    if (prop && rest.length) {
      const key = prop
        .trim()
        .replace(/;$/, '')
        .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
      const value = rest.join(':').trim().replace(/;$/, '')
      if (key && value) iframeStyle[key] = value
    }
  })

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://at.fund'
  const labelParam = buttonLabel && buttonLabel !== 'Support' ? `?label=${encodeURIComponent(buttonLabel)}` : ''
  const embedSrc = handle.trim()
    ? `${origin}/embed/${handle.trim()}${labelParam}`
    : ''
  const publicSrc = handle.trim()
    ? `https://at.fund/embed/${handle.trim()}${labelParam}`
    : ''

  const embedHtml = publicSrc
    ? `<iframe\n  src="${publicSrc}"\n  style="${customCss.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')}"\n  title="Support on at.fund"\n></iframe>`
    : ''

  return (
    <div className="space-y-6">
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
      </div>

      {/* Raw data */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Steward data
          </p>
          <code className="text-[11px] text-slate-400 dark:text-slate-500">
            GET /api/steward?uri={handle.trim() || '…'}
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

      {/* Two-column: controls | preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: controls */}
        <div className="space-y-4">
          {/* Preset pills */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Presets
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p, i) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => selectPreset(i)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    i === activePreset
                      ? 'bg-[var(--support)] text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* CSS textarea */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Iframe styles
            </p>
            <textarea
              rows={5}
              value={customCss}
              onChange={(e) => {
                setCustomCss(e.target.value)
                setActivePreset(-1)
              }}
              spellCheck={false}
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder-slate-500"
            />
          </div>

          {/* Embed code output */}
          {embedHtml && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Embed code
                </p>
                <CopyButton text={embedHtml} label="Copy HTML" />
              </div>
              <pre className="overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300">
                {embedHtml}
              </pre>
            </div>
          )}
        </div>

        {/* Right: live preview */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Live preview
          </p>
          <div className="flex min-h-[120px] items-start justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/30">
            {embedSrc ? (
              <iframe
                key={iframeKey}
                src={embedSrc}
                style={iframeStyle}
                title="Support on at.fund"
              />
            ) : (
              <p className="text-sm text-slate-400">Enter a handle to see the preview</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
