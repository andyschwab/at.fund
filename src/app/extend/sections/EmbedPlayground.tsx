'use client'

import { useState } from 'react'
import { CopyButton } from '../ui'

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

type Preset = { label: string; css: string }

const PRESETS: Preset[] = [
  {
    label: 'Default',
    css: `border: none;
width: 320px;
height: 80px;`,
  },
  {
    label: 'Card',
    css: `border: 1px solid #e2e8f0;
border-radius: 12px;
width: 340px;
height: 84px;
box-shadow: 0 1px 3px rgba(0,0,0,0.08);`,
  },
  {
    label: 'Dark',
    css: `border: 1px solid #334155;
border-radius: 12px;
width: 340px;
height: 84px;
background: #0f172a;
box-shadow: 0 1px 3px rgba(0,0,0,0.3);`,
  },
  {
    label: 'Compact',
    css: `border: none;
width: 240px;
height: 80px;
transform: scale(0.85);
transform-origin: top left;`,
  },
  {
    label: 'Full width',
    css: `border: none;
width: 100%;
max-width: 400px;
height: 80px;`,
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmbedPlayground() {
  const [handle, setHandle] = useState('blacksky.app')
  const [activePreset, setActivePreset] = useState(0)
  const [customCss, setCustomCss] = useState(PRESETS[0].css)

  function selectPreset(i: number) {
    setActivePreset(i)
    setCustomCss(PRESETS[i].css)
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

  const embedSrc = handle.trim()
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://at.fund'}/embed/${handle.trim()}`
    : ''

  const embedHtml = embedSrc
    ? `<iframe\n  src="${embedSrc}"\n  style="${customCss.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')}"\n  title="Support on at.fund"\n></iframe>`
    : ''

  return (
    <div className="space-y-6">
      {/* Handle input */}
      <div className="flex items-center gap-3">
        <label className="shrink-0 text-sm font-medium text-slate-700 dark:text-slate-300">
          Handle
        </label>
        <input
          type="text"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="handle, DID, or hostname"
          spellCheck={false}
          className="w-full max-w-xs rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-sm text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder-slate-500"
        />
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
              rows={6}
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
          <div className="flex min-h-[160px] items-start justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 dark:border-slate-700 dark:bg-slate-800/30">
            {embedSrc ? (
              <iframe
                key={handle.trim()}
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
