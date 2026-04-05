'use client'

import { useRef, useState } from 'react'
import { AlertCircle, LogIn } from 'lucide-react'
import { StewardCard } from '@/components/ProjectCards'
import { HandleAutocomplete } from '@/components/HandleAutocomplete'
import { useSession } from '@/components/SessionContext'
import type { StewardEntry } from '@/lib/steward-model'

export function StackEntriesList({
  entries,
  allEntries,
}: {
  entries: StewardEntry[]
  allEntries: StewardEntry[]
}) {
  const { login, loginError, loginLoading } = useSession()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [handle, setHandle] = useState('')

  function handleEndorse() {
    dialogRef.current?.showModal()
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!handle.trim()) return
    void login(handle.trim())
  }

  return (
    <>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900/60">
        {entries.map((entry) => (
          <StewardCard
            key={entry.uri}
            entry={entry}
            allEntries={allEntries}
            active
            onEndorse={handleEndorse}
          />
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl backdrop:bg-black/40 dark:bg-slate-900"
      >
        <h2 className="mb-1 text-base font-semibold text-slate-900 dark:text-slate-100">
          Sign in to endorse
        </h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Sign in with Bluesky to add projects to your stack.
        </p>
        <form onSubmit={handleLogin} className="space-y-3">
          <HandleAutocomplete
            value={handle}
            onChange={setHandle}
            placeholder="you.bsky.social"
            disabled={loginLoading}
            inputClassName="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)]/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loginLoading || !handle.trim()}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              {loginLoading ? 'Redirecting…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
        {loginError && (
          <p className="mt-3 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {loginError}
          </p>
        )}
      </dialog>
    </>
  )
}
