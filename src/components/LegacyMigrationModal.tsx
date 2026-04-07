'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/components/SessionContext'

type Status = 'checking' | 'idle' | 'show' | 'migrating' | 'error' | 'done'

/**
 * Blocking modal that forces legacy record migration before the user can
 * interact with the app. Renders in the root layout so it covers every page.
 */
export function LegacyMigrationModal() {
  const { hasSession, authFetch } = useSession()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [status, setStatus] = useState<Status>('checking')
  const [error, setError] = useState<string | null>(null)

  // Check once on mount whether the user has legacy records.
  useEffect(() => {
    if (!hasSession) return

    let cancelled = false
    authFetch('/api/migrate/check')
      .then((res) => res.json())
      .then((data: { needsMigration?: boolean }) => {
        if (cancelled) return
        if (data.needsMigration) {
          setStatus('show')
        } else {
          setStatus('idle')
        }
      })
      .catch(() => {
        // Network error or 401 — don't block the user
        if (!cancelled) setStatus('idle')
      })

    return () => { cancelled = true }
  }, [hasSession, authFetch])

  // Open the dialog when we know migration is needed.
  useEffect(() => {
    if (status === 'show' || status === 'migrating' || status === 'error') {
      if (dialogRef.current && !dialogRef.current.open) {
        dialogRef.current.showModal()
      }
    }
    if (status === 'done') {
      dialogRef.current?.close()
    }
  }, [status])

  async function handleMigrate() {
    setStatus('migrating')
    setError(null)
    try {
      const res = await authFetch('/api/migrate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Migration failed')
      setStatus('done')
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Migration failed. Try again.')
      setStatus('error')
    }
  }

  // Don't render anything if no session or no migration needed.
  if (!hasSession || status === 'idle' || status === 'checking' || status === 'done') {
    return null
  }

  const migrating = status === 'migrating'

  return (
    <dialog
      ref={dialogRef}
      className="m-auto max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 dark:border-slate-800 dark:bg-slate-950"
      onCancel={(e) => e.preventDefault()}
    >
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Update your records
        </p>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your fund.at records use an older format. A quick one-time update is
          needed to keep everything working. This only takes a moment.
        </p>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          type="button"
          onClick={handleMigrate}
          disabled={migrating}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {migrating ? 'Updating\u2026' : 'Update my records'}
        </button>
      </div>
    </dialog>
  )
}
