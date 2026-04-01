'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

type SessionState = {
  hasSession: boolean
  did: string | null
}

type SessionContextValue = SessionState & {
  login: (handle: string) => Promise<void>
  logout: () => Promise<void>
  loginError: string | null
  loginLoading: boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}

export function SessionProvider({
  initial,
  children,
}: {
  initial: SessionState
  children: ReactNode
}) {
  const [state, setState] = useState<SessionState>(initial)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  const login = useCallback(async (handle: string) => {
    setLoginLoading(true)
    setLoginError(null)
    try {
      const res = await fetch('/oauth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      })
      const data = (await res.json()) as {
        redirectUrl?: string
        detail?: string
        error?: string
      }
      if (!res.ok) throw new Error(data.detail ?? data.error ?? 'Login failed')
      window.location.href = data.redirectUrl!
    } catch (x) {
      setLoginError(
        x instanceof Error
          ? x.message === 'Login failed'
            ? 'Something went wrong. Try again.'
            : x.message
          : 'Something went wrong. Try again.',
      )
      setLoginLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/oauth/logout', { method: 'POST' })
    setState({ hasSession: false, did: null })
    window.location.href = '/'
  }, [])

  return (
    <SessionContext.Provider
      value={{
        ...state,
        login,
        logout,
        loginError,
        loginLoading,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}
