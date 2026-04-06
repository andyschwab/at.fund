'use client'

import { useRef, useState } from 'react'
import { Code, Loader2, Send } from 'lucide-react'
import { ENDPOINTS, SECTIONS, generateFetchSnippet } from '../endpoint-catalog'
import type { EndpointConfig } from '../endpoint-catalog'
import { MethodBadge, AuthBadge, CopyButton } from '../ui'

// ---------------------------------------------------------------------------
// Endpoint row
// ---------------------------------------------------------------------------

function EndpointRow({ ep }: { ep: EndpointConfig }) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    ep.params?.forEach((p) => {
      const key = p.kind === 'query' ? (p.key ?? '') : 'body'
      init[key] = p.default ?? ''
    })
    return init
  })
  const [loading, setLoading] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [httpStatus, setHttpStatus] = useState<number | null>(null)
  const [showSnippet, setShowSnippet] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  async function run() {
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort
    setLoading(true)
    setOutput(null)
    setHttpStatus(null)

    try {
      const qp = new URLSearchParams()
      let bodyStr: string | undefined

      ep.params?.forEach((p) => {
        if (p.kind === 'query') {
          const v = values[p.key ?? '']?.trim()
          if (v) qp.set(p.key ?? '', v)
        } else {
          const v = values['body']?.trim()
          if (v) bodyStr = v
        }
      })

      const qs = qp.toString()
      const url = ep.path + (qs ? `?${qs}` : '')

      if (ep.streaming) {
        const res = await fetch(url, { signal: abort.signal })
        setHttpStatus(res.status)
        const reader = res.body?.getReader()
        if (!reader) {
          setOutput('No response body')
          return
        }
        const decoder = new TextDecoder()
        let text = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          text += decoder.decode(value, { stream: true })
          setOutput(text)
        }
      } else {
        const res = await fetch(url, {
          method: ep.method,
          headers: bodyStr ? { 'Content-Type': 'application/json' } : {},
          body: bodyStr,
          signal: abort.signal,
        })
        setHttpStatus(res.status)
        const text = await res.text()
        try {
          setOutput(JSON.stringify(JSON.parse(text), null, 2))
        } catch {
          setOutput(text)
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setOutput((e as Error).message)
        setHttpStatus(0)
      }
    } finally {
      setLoading(false)
    }
  }

  const inputBase =
    'w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder-slate-500'

  const snippet = generateFetchSnippet(ep, values)

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <MethodBadge method={ep.method} />
        <code className="font-mono text-sm font-medium text-slate-700 dark:text-slate-300">
          {ep.path}
        </code>
        <AuthBadge level={ep.auth} />
        {ep.streaming && (
          <span className="shrink-0 rounded border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-400">
            stream
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{ep.description}</p>

      {ep.note && (
        <p className="mt-2 rounded-md bg-[var(--support-muted)] px-3 py-1.5 text-xs text-[var(--support)]">
          {ep.note}
        </p>
      )}

      {/* Params */}
      {ep.params && ep.params.length > 0 && (
        <div className="mt-3 space-y-2">
          {ep.params.map((p) => {
            const key = p.kind === 'query' ? (p.key ?? '') : 'body'
            return (
              <div key={key} className="flex items-start gap-2">
                <label className="mt-1.5 w-20 shrink-0 text-right text-[11px] text-slate-400">
                  {p.label}
                </label>
                {p.multiline ? (
                  <textarea
                    rows={3}
                    value={values[key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    placeholder={p.placeholder}
                    spellCheck={false}
                    className={`${inputBase} resize-y`}
                  />
                ) : (
                  <input
                    type="text"
                    value={values[key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                    placeholder={p.placeholder}
                    spellCheck={false}
                    className={inputBase}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Send row */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Send className="h-3.5 w-3.5" aria-hidden />
          )}
          {loading ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          onClick={() => setShowSnippet((s) => !s)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Code className="h-3 w-3" aria-hidden />
          {showSnippet ? 'Hide code' : 'Copy as fetch'}
        </button>
        {httpStatus !== null && (
          <span
            className={`font-mono text-xs font-semibold ${
              httpStatus >= 200 && httpStatus < 300
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {httpStatus === 0 ? 'network error' : httpStatus}
          </span>
        )}
        {loading && ep.streaming && (
          <span className="text-xs text-slate-400">streaming…</span>
        )}
      </div>

      {/* Fetch snippet */}
      {showSnippet && (
        <div className="group relative mt-3">
          <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={snippet} />
          </div>
          <pre className="overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-300">
            {snippet}
          </pre>
        </div>
      )}

      {/* Response */}
      {output !== null && (
        <div className="group relative mt-3">
          <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
            <CopyButton text={output} label="Copy response" />
          </div>
          <pre className="max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200">
            {output}
          </pre>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// API Explorer section
// ---------------------------------------------------------------------------

export function ApiExplorer() {
  return (
    <div className="space-y-10">
      {SECTIONS.map(({ title, subtitle, ids }) => (
        <section key={title}>
          <div className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>
          </div>
          <div className="space-y-3">
            {ids.map((id) => {
              const ep = ENDPOINTS.find((e) => e.id === id)
              if (!ep) return null
              return <EndpointRow key={id} ep={ep} />
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
