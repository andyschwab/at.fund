'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bug,
  HeartHandshake,
  LogIn,
  LogOut,
  Menu,
  X,
} from 'lucide-react'
import { useSession } from '@/components/SessionContext'
import { LoginForm } from '@/components/LoginForm'

const NAV_LINKS = [
  { href: '/give', label: 'Give' },
  { href: '/spec', label: 'Spec' },
  { href: '/extend', label: 'Extend' },
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
  const { hasSession, handle, did, logout } = useSession()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [mobileOpen, setMobileOpen] = useState(false)

  function openAuthModal() {
    dialogRef.current?.showModal()
  }

  function closeAuthModal() {
    dialogRef.current?.close()
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
            {hasSession && (handle || did) && (
              <Link
                href={`/${handle ?? did}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  pathname === `/${handle ?? did}`
                    ? 'bg-[var(--support-muted)] text-[var(--support)]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`}
              >
                My Profile
              </Link>
            )}
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
            {hasSession ? (
              <button
                type="button"
                onClick={() => void logout()}
                className="ml-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign Out
              </button>
            ) : (
              <button
                type="button"
                onClick={openAuthModal}
                className="ml-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                Login
              </button>
            )}
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
              {hasSession && (handle || did) && (
                <Link
                  href={`/${handle ?? did}`}
                  onClick={() => setMobileOpen(false)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    pathname === `/${handle ?? did}`
                      ? 'bg-[var(--support-muted)] text-[var(--support)]'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  My Profile
                </Link>
              )}
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
              {hasSession ? (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    void logout()
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <LogOut className="h-4 w-4" aria-hidden />
                  Sign Out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    openAuthModal()
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <LogIn className="h-4 w-4" aria-hidden />
                  Login
                </button>
              )}
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
            Sign in
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

        <div className="min-h-72 p-5">
          <LoginForm id="nav-handle-input" />
        </div>
      </dialog>
    </>
  )
}
