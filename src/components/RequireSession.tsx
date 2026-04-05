'use client'

import { useSession } from '@/components/SessionContext'
import { LoginForm } from '@/components/LoginForm'
import type { ReactNode } from 'react'

export function RequireSession({ children }: { children: ReactNode }) {
  const { hasSession } = useSession()

  if (hasSession) return <>{children}</>

  return (
    <div className="page-wash flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <p className="mb-4 text-center text-sm font-medium text-slate-700 dark:text-slate-300">
          Sign in to continue
        </p>
        <LoginForm id="require-session-handle" />
      </div>
    </div>
  )
}
