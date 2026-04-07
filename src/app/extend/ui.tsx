'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import type { Method, AuthLevel } from './endpoint-catalog'

export function MethodBadge({ method }: { method: Method }) {
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

export function AuthBadge({ level }: { level: AuthLevel }) {
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

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-500" aria-hidden />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" aria-hidden />
          {label}
        </>
      )}
    </button>
  )
}

export function CodeBlock({ code, language = '' }: { code: string; language?: string }) {
  return (
    <div className="group relative">
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton text={code} />
      </div>
      <pre className="overflow-auto rounded-lg bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
        {language && (
          <span className="mb-2 block text-[10px] uppercase tracking-wider text-slate-500">
            {language}
          </span>
        )}
        {code}
      </pre>
    </div>
  )
}
