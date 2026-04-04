'use client'

import { useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Method = 'GET' | 'POST' | 'DELETE'
type AuthLevel = 'public' | 'auth' | 'admin'

type ParamDef = {
  kind: 'query' | 'body'
  key?: string // required when kind='query'
  label: string
  placeholder: string
  default?: string
  multiline?: boolean
}

type EndpointConfig = {
  id: string
  method: Method
  path: string
  description: string
  auth: AuthLevel
  params?: ParamDef[]
  streaming?: boolean
  note?: string
}

// ---------------------------------------------------------------------------
// Endpoint catalog
// ---------------------------------------------------------------------------

const ENDPOINTS: EndpointConfig[] = [
  // ── Public ────────────────────────────────────────────────────────────────
  {
    id: 'health',
    method: 'GET',
    path: '/api/health',
    description: 'Health check — confirms the server is reachable.',
    auth: 'public',
  },
  {
    id: 'auth-check',
    method: 'GET',
    path: '/api/auth/check',
    description: 'Returns current session validity. { valid: bool, did: string | null }',
    auth: 'public',
  },
  {
    id: 'steward',
    method: 'GET',
    path: '/api/steward',
    description:
      'Thin resolution — identity + funding only. No capability discovery or transitive dependency resolution. Use /api/entry for the full pipeline.',
    auth: 'public',
    params: [
      {
        kind: 'query',
        key: 'uri',
        label: 'uri',
        placeholder: 'handle, DID, or hostname',
        default: 'blacksky.app',
      },
    ],
  },
  {
    id: 'entry',
    method: 'GET',
    path: '/api/entry',
    description:
      'Full vertical resolution for a single URI — identity → funding → capabilities → dependencies. Returns { entry: StewardEntry, referenced: StewardEntry[] }.',
    auth: 'public',
    params: [
      {
        kind: 'query',
        key: 'uri',
        label: 'uri',
        placeholder: 'handle, DID, or hostname',
        default: 'blacksky.app',
      },
    ],
    note: 'Use this to test PDS catalog entries. Try: blacksky.app · eurosky.social · tngl.sh · roomy.chat',
  },
  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    id: 'lexicons',
    method: 'GET',
    path: '/api/lexicons',
    description: 'Non-streaming repo scan for the signed-in user. Accepts optional extra steward URIs to append.',
    auth: 'auth',
    params: [
      {
        kind: 'query',
        key: 'extraStewards',
        label: 'extraStewards',
        placeholder: 'comma-separated URIs (optional)',
      },
    ],
  },
  {
    id: 'lexicons-stream',
    method: 'GET',
    path: '/api/lexicons/stream',
    description:
      'Streaming NDJSON scan. Each newline-delimited JSON object is a pipeline event: meta, status, entry, referenced, pds-host, warning, done.',
    auth: 'auth',
    params: [
      {
        kind: 'query',
        key: 'extraStewards',
        label: 'extraStewards',
        placeholder: 'comma-separated URIs (optional)',
      },
    ],
    streaming: true,
  },
  {
    id: 'lexicons-post',
    method: 'POST',
    path: '/api/lexicons',
    description: 'Repo scan with self-reported steward URIs supplied in the request body.',
    auth: 'auth',
    params: [
      {
        kind: 'body',
        label: 'body',
        placeholder: '{"selfReportedStewards":["bsky.app"]}',
        default: '{"selfReportedStewards":[]}',
      },
    ],
  },
  {
    id: 'endorse',
    method: 'POST',
    path: '/api/endorse',
    description: 'Create a fund.at.endorse record on your PDS. Idempotent — endorsing the same URI twice is a no-op.',
    auth: 'auth',
    params: [
      {
        kind: 'body',
        label: 'body',
        placeholder: '{"uri":"bsky.app"}',
        default: '{"uri":""}',
      },
    ],
  },
  {
    id: 'endorse-delete',
    method: 'DELETE',
    path: '/api/endorse',
    description: 'Remove a fund.at.endorse record from your PDS.',
    auth: 'auth',
    params: [
      {
        kind: 'body',
        label: 'body',
        placeholder: '{"uri":"bsky.app"}',
        default: '{"uri":""}',
      },
    ],
  },
  {
    id: 'setup',
    method: 'POST',
    path: '/api/setup',
    description:
      'Publish fund.at records to your PDS — writes fund.at.contribute and/or fund.at.dependency records.',
    auth: 'auth',
    params: [
      {
        kind: 'body',
        label: 'body',
        placeholder: '{"contributeUrl":"https://...","dependencies":[{"uri":"bsky.app"}]}',
        default: '{\n  "contributeUrl": "",\n  "dependencies": []\n}',
        multiline: true,
      },
    ],
  },
  // ── Admin ─────────────────────────────────────────────────────────────────
  {
    id: 'pds-platforms',
    method: 'POST',
    path: '/api/admin/pds-platforms',
    description:
      'Fingerprint PDS hosts via com.atproto.server.describeServer. Detects platform (atproto, picopds, nginx, …). Returns summary + per-host fingerprints.',
    auth: 'admin',
    params: [
      {
        kind: 'body',
        label: 'body',
        placeholder: '{"hosts":"blacksky.app\\neurosky.social"}',
        default: '{"hosts":"blacksky.app\\neurosky.social\\ntngl.sh\\nroomy.chat"}',
        multiline: true,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function MethodBadge({ method }: { method: Method }) {
  const cls = {
    GET: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    DELETE: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400',
  }[method]
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold ${cls}`}>
      {method}
    </span>
  )
}

function AuthBadge({ level }: { level: AuthLevel }) {
  if (level === 'public') return null
  const cls =
    level === 'auth'
      ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400'
      : 'bg-rose-50 border-rose-200 text-rose-700 dark:bg-rose-900/20 dark:border-rose-800 dark:text-rose-400'
  return (
    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {level}
    </span>
  )
}

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

      {/* Response */}
      {output !== null && (
        <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs leading-relaxed text-slate-200">
          {output}
        </pre>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const SECTIONS: Array<{ title: string; subtitle: string; ids: string[] }> = [
  {
    title: 'Public',
    subtitle: 'No authentication required',
    ids: ['health', 'auth-check', 'steward', 'entry'],
  },
  {
    title: 'Authenticated',
    subtitle: 'Requires an active session — sign in via the navbar first',
    ids: ['lexicons', 'lexicons-stream', 'lexicons-post', 'endorse', 'endorse-delete', 'setup'],
  },
  {
    title: 'Admin',
    subtitle: 'Requires admin handle',
    ids: ['pds-platforms'],
  },
]

export function DevClient() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          API Explorer
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          at.fund API endpoints — documented and testable inline.
        </p>
      </div>

      <div className="space-y-10">
        {SECTIONS.map(({ title, subtitle, ids }) => (
          <section key={title}>
            <div className="mb-3 border-b border-slate-200 pb-2 dark:border-slate-800">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {title}
              </h2>
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
    </div>
  )
}
