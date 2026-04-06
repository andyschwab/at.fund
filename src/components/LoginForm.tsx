'use client'

import { useState } from 'react'
import { AlertCircle, LogIn, Monitor } from 'lucide-react'
import { useSession } from '@/components/SessionContext'
import { HandleAutocomplete } from '@/components/HandleAutocomplete'

/**
 * Shared sign-in form used by NavBar (modal) and RequireSession (full-page).
 * Handles input state, login dispatch, error display, and local dev tip.
 */
export function LoginForm({ id }: { id: string }) {
  const { login, loginError, loginLoading } = useSession()
  const [handle, setHandle] = useState('')

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!handle.trim()) return
    void login(handle.trim())
  }

  return (
    <form onSubmit={handleLogin} className="space-y-3">
      <div className="space-y-1">
        <label
          htmlFor={id}
          className="block text-sm text-slate-600 dark:text-slate-400"
        >
          Your Atmosphere handle
        </label>
        <div className="flex gap-2">
          <HandleAutocomplete
            id={id}
            value={handle}
            onChange={setHandle}
            placeholder="you.bsky.social"
            disabled={loginLoading}
            inputClassName="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)]/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <button
            type="submit"
            disabled={loginLoading || !handle.trim()}
            className="shrink-0 inline-flex items-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" aria-hidden />
            {loginLoading ? 'Redirecting\u2026' : 'Sign in'}
          </button>
        </div>
      </div>
      {loginError && (
        <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {loginError}
        </p>
      )}
      <details className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
          <Monitor className="h-4 w-4 shrink-0" aria-hidden />
          Local development
          <span className="text-slate-400">{'\u25BE'}</span>
        </summary>
        <p className="mt-2 pl-6 leading-relaxed">
          Use{' '}
          <code className="font-mono text-slate-700 dark:text-slate-300">
            127.0.0.1
          </code>{' '}
          (not <code className="font-mono">localhost</code>) so sign-in
          redirects work.
        </p>
      </details>
    </form>
  )
}
