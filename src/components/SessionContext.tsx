'use client'

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

type SessionState = {
  hasSession: boolean
  did: string | null
}

type SessionContextValue = SessionState & {
  login: (handle: string) => Promise<void>
  logout: () => Promise<void>
  invalidateSession: () => Promise<void>
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  loginError: string | null
  loginLoading: boolean
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}

async function checkSession(): Promise<{ valid: boolean; did: string | null }> {
  try {
    const res = await fetch('/api/auth/check')
    if (!res.ok) {
      console.warn('[auth] session check returned', res.status)
      return { valid: false, did: null }
    }
    return await res.json()
  } catch (err) {
    console.warn('[auth] session check network error:', err)
    // Network error — don't invalidate, could be transient
    return { valid: true, did: null }
  }
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
  const pathname = usePathname()
  const lastValidatedPath = useRef<string>(pathname)

  const invalidateSession = useCallback(async () => {
    // Fire-and-forget logout to clear server cookie
    try { await fetch('/oauth/logout', { method: 'POST' }) } catch {}
    setState({ hasSession: false, did: null })
    // Full reload so SSR re-evaluates session state cleanly
    window.location.href = '/'
  }, [])

  const authFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const res = await fetch(input, init)
      if (res.status === 401) {
        await invalidateSession()
        throw new Error('Session expired')
      }
      return res
    },
    [invalidateSession],
  )

  const validateSession = useCallback(async () => {
    // Only validate if the client thinks it has a session
    if (!state.hasSession) return

    const result = await checkSession()
    if (!result.valid) {
      console.warn('[auth] session invalidated — server could not restore session')
      await invalidateSession()
    }
  }, [state.hasSession, invalidateSession])

  // Validate on route change (client-side navigation)
  useEffect(() => {
    if (pathname !== lastValidatedPath.current) {
      lastValidatedPath.current = pathname
      validateSession()
    }
  }, [pathname, validateSession])

  // Validate on tab focus (user returning to stale tab)
  useEffect(() => {
    const onFocus = () => validateSession()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [validateSession])

  const login = useCallback(async (handle: string) => {
    setLoginLoading(true)
    setLoginError(null)
    const timeout = setTimeout(() => {
      setLoginError('Login is taking longer than expected. Please try again.')
      setLoginLoading(false)
    }, 15_000)
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
      clearTimeout(timeout)
      window.location.href = data.redirectUrl!
    } catch (x) {
      clearTimeout(timeout)
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
        invalidateSession,
        authFetch,
        loginError,
        loginLoading,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}
