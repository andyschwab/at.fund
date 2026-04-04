'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertCircle,
  Bug,
  HeartHandshake,
  LogIn,
  LogOut,
  Menu,
  Monitor,
  User,
  X,
} from 'lucide-react'
import { useSession } from '@/components/SessionContext'
import { HandleAutocomplete } from '@/components/HandleAutocomplete'

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/give', label: 'Give' },
  { href: '/setup', label: 'Receive' },
  { href: '/analytics', label: 'Explore' },
  { href: '/lexicon', label: 'Build' },
] as const

const BUG_REPORT_URL = 'https://github.com/andyschwab/at.fund/issues/new'

function Logo() {
  return (
    <span className="inline-flex items-center font-mono text-lg font-medium text-slate-500 dark:text-slate-400">
      at
      <HeartHandshake className="mx-[0.12em] inline-block h-[0.85em] w-[0.85em] translate-y-[0.04em] text-[var(--support)]" strokeWidth={1.75} aria-hidden />
      fund
    </span>
  )
}

export function NavBar() {
  const pathname = usePathname()
  const { hasSession, login, logout, loginError, loginLoading } = useSession()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [handle, setHandle] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  function openAuthModal() {
    dialogRef.current?.showModal()
  }

  function closeAuthModal() {
    dialogRef.current?.close()
  }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!handle.trim()) return
    void login(handle.trim())
  }

  return (
    <>
      <nav className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 sm:flex">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[var(--support-muted)] text-[var(--support)]'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
            <button
              type="button"
              onClick={openAuthModal}
              className="ml-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              {hasSession ? (
                <>
                  <User className="h-4 w-4" aria-hidden />
                  Account
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" aria-hidden />
                  Login
                </>
              )}
            </button>
            <a
              href={BUG_REPORT_URL}
              target="_blank"
              rel="noreferrer"
              title="Report a bug"
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <Bug className="h-4 w-4" aria-hidden />
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 sm:hidden dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Menu"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="border-t border-slate-200/80 px-4 py-3 sm:hidden dark:border-slate-800">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map(({ href, label }) => {
                const active = pathname === href
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[var(--support-muted)] text-[var(--support)]'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                    }`}
                  >
                    {label}
                  </Link>
                )
              })}
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false)
                  openAuthModal()
                }}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {hasSession ? (
                  <>
                    <User className="h-4 w-4" aria-hidden />
                    Account
                  </>
                ) : (
                  <>
                    <LogIn className="h-4 w-4" aria-hidden />
                    Login
                  </>
                )}
              </button>
              <a
                href={BUG_REPORT_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Bug className="h-4 w-4" aria-hidden />
                Report a bug
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Auth modal */}
      <dialog
        ref={dialogRef}
        className="m-auto max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 dark:border-slate-800 dark:bg-slate-950"
        onClick={(e) => {
          if (e.target === e.currentTarget) closeAuthModal()
        }}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {hasSession ? 'Your session' : 'Sign in'}
          </p>
          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="p-5">
          {hasSession ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--support-muted)] text-sm font-semibold text-[var(--support)]"
                  aria-hidden
                >
                  <User className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Signed in
                  </p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    Session active
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  closeAuthModal()
                  void logout()
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-3">
              <div className="space-y-1">
                <label
                  htmlFor="nav-handle-input"
                  className="block text-sm text-slate-600 dark:text-slate-400"
                >
                  Your Bluesky handle
                </label>
                <div className="flex gap-2">
                  <HandleAutocomplete
                    id="nav-handle-input"
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
                    {loginLoading ? 'Redirecting…' : 'Sign in'}
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
                  <span className="text-slate-400">▾</span>
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
          )}
        </div>
      </dialog>
    </>
  )
}
