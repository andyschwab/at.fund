'use client'

import { useState, useMemo } from 'react'
import type { ScanResult } from '@/lib/lexicon-scan'
import { pdslsRepoUrl } from '@/lib/pdsls'
import {
  KnownProjectCard,
  PdsHostSupportCard,
  UnknownProjectCard,
} from '@/components/ProjectCards'
import {
  AlertCircle,
  BookOpen,
  ExternalLink,
  HandCoins,
  Heart,
  Layers,
  LogIn,
  LogOut,
  Monitor,
  PlusCircle,
  RefreshCw,
  Sparkles,
  UserRound,
} from 'lucide-react'

type Props = {
  hasSession: boolean
  initialScan: ScanResult | null
  error?: string
}

function userInitial(handleOrDid: string): string {
  const h = handleOrDid.replace(/^@/, '')
  if (h.includes('.')) return h[0]!.toUpperCase()
  return h.slice(0, 2).toUpperCase()
}

export function HomeClient({ hasSession, initialScan, error }: Props) {
  const [handle, setHandle] = useState('')
  const [loading, setLoading] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(initialScan)
  const [selfReport, setSelfReport] = useState('')
  const [err, setErr] = useState<string | null>(
    error ? 'Something went wrong signing in. Try again.' : null,
  )

  const knownGroups = useMemo(
    () => scan?.appGroups.filter((g) => g.confidence === 'curated') ?? [],
    [scan?.appGroups],
  )
  const unknownGroups = useMemo(
    () => scan?.appGroups.filter((g) => g.confidence === 'unknown') ?? [],
    [scan?.appGroups],
  )

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/oauth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      window.location.href = data.redirectUrl
    } catch (x) {
      setErr(
        x instanceof Error
          ? x.message === 'Login failed'
            ? 'Something went wrong. Try again.'
            : x.message
          : 'Something went wrong. Try again.',
      )
      setLoading(false)
    }
  }

  async function logout() {
    await fetch('/oauth/logout', { method: 'POST' })
    window.location.reload()
  }

  async function runScan(extra: string[]) {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/lexicons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfReportedNsids: extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      setScan(data)
    } catch (x) {
      setErr(
        x instanceof Error
          ? x.message === 'Scan failed'
            ? 'Could not refresh your list. Try again.'
            : x.message
          : 'Could not refresh your list. Try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  function parseSelfReportInput(): string[] {
    return selfReport
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const collectionCount =
    scan?.appGroups.reduce((n, g) => n + g.collections.length, 0) ?? 0
  const appCount = scan?.appGroups.length ?? 0
  const displayId = scan?.handle ?? scan?.did ?? ''

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--support-border)] bg-[var(--support-muted)] px-3 py-1 text-xs font-medium text-[var(--support)] dark:text-emerald-400">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Free · ATProto sign-in
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Give back to tools you use
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            We look at what your account has actually saved—not every app
            you&apos;ve opened. Then we show you where you can support a project,
            and a few we&apos;re still learning about.
          </p>
        </header>

        {!hasSession ? (
          <section className="rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
            <div className="mb-4 flex items-center gap-2 text-lg font-medium text-zinc-900 dark:text-zinc-100">
              <UserRound className="h-5 w-5 text-[var(--support)] dark:text-emerald-400" aria-hidden />
              Connect
            </div>
            <form onSubmit={login} className="flex max-w-md flex-col gap-3">
              <label className="text-sm text-zinc-600 dark:text-zinc-400">
                Your handle
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="you.bsky.social"
                  className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  disabled={loading}
                  required
                />
              </label>
              {err && (
                <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {err}
                </p>
              )}
              <button
                type="submit"
                disabled={loading || !handle.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <LogIn className="h-4 w-4" aria-hidden />
                {loading ? 'Redirecting…' : 'Continue'}
              </button>
              <details className="mt-2 max-w-md rounded-lg border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
                  <Monitor className="h-4 w-4 shrink-0" aria-hidden />
                  Local development
                  <span className="text-zinc-400">▾</span>
                </summary>
                <p className="mt-2 pl-6 leading-relaxed">
                  Use <code className="font-mono text-zinc-700 dark:text-zinc-300">127.0.0.1</code>{' '}
                  (not <code className="font-mono">localhost</code>) so sign-in
                  redirects work.
                </p>
              </details>
            </form>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-950/90">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--support-muted)] text-sm font-semibold text-[var(--support)] dark:text-emerald-400"
                  aria-hidden
                >
                  {displayId ? userInitial(displayId) : '…'}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Signed in
                  </p>
                  <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {displayId || '…'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {scan?.did && (
                  <a
                    href={pdslsRepoUrl(scan.did)}
                    target="_blank"
                    rel="noreferrer"
                    title="Opens PDSls in a new tab"
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                    <span className="hidden sm:inline">Data explorer</span>
                    <span className="sm:hidden">Explorer</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => runScan(parseSelfReportInput())}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <RefreshCw
                    className={`h-4 w-4 shrink-0 ${loading ? 'animate-spin' : ''}`}
                    aria-hidden
                  />
                  <span className="hidden sm:inline">
                    {loading ? 'Scanning…' : 'Refresh'}
                  </span>
                  <span className="sm:hidden">
                    {loading ? '…' : 'Refresh'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  aria-label="Sign out"
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                >
                  <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </div>
            </section>

            {err && (
              <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {err}
              </p>
            )}

            <section className="space-y-10">
              {scan?.pdsHostFunding && (
                <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/60 dark:border-zinc-800 dark:bg-zinc-950/40">
                  <div className="flex gap-3 border-b border-sky-200/80 bg-sky-50/80 px-5 py-4 dark:border-sky-500/20 dark:bg-sky-950/30">
                    <span
                      className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/90 text-sky-700 shadow-sm dark:bg-zinc-900/80 dark:text-sky-400"
                      aria-hidden
                    >
                      <Monitor className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                        Your host
                      </h2>
                      <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
                        Where your account is stored may also accept support—
                        separate from individual apps below.
                      </p>
                    </div>
                  </div>
                  <div className="p-5">
                    <PdsHostSupportCard funding={scan.pdsHostFunding} />
                  </div>
                </div>
              )}

              {!scan ? (
                <p className="text-sm text-zinc-500">
                  Could not load your projects.{' '}
                  <button
                    type="button"
                    onClick={() => runScan([])}
                    className="font-medium text-[var(--support)] underline dark:text-emerald-400"
                  >
                    Try again
                  </button>
                </p>
              ) : scan.appGroups.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  We didn&apos;t find any extra tools in your saved data yet. You
                  can add more below if you know them.
                </p>
              ) : (
                <>
                  {knownGroups.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/60 dark:border-zinc-800 dark:bg-zinc-950/40">
                      <div className="flex gap-3 border-b border-[var(--support-border)]/50 bg-[var(--support-muted)] px-5 py-4 dark:border-emerald-500/20">
                        <span
                          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[var(--support)] shadow-sm dark:bg-zinc-900/80 dark:text-emerald-400"
                          aria-hidden
                        >
                          <HandCoins className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <div>
                          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                            Projects you can support
                          </h2>
                          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
                            These have links to donate, sponsor, or learn more.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-4 p-5">
                        {knownGroups.map((group) => (
                          <KnownProjectCard
                            key={group.appName}
                            group={group}
                            did={scan.did}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {unknownGroups.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/60 dark:border-zinc-800 dark:bg-zinc-950/40">
                      <div className="flex gap-3 border-b border-[var(--discover-border)]/60 bg-[var(--discover-muted)] px-5 py-4 dark:border-amber-500/25">
                        <span
                          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[var(--discover)] shadow-sm dark:bg-zinc-900/80 dark:text-amber-400"
                          aria-hidden
                        >
                          <Sparkles className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <div>
                          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                            Still learning about these
                          </h2>
                          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
                            Your account has something saved from these tools—we
                            don&apos;t have give-back links for them yet.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-4 p-5">
                        {unknownGroups.map((group) => (
                          <UnknownProjectCard
                            key={group.appName}
                            group={group}
                            did={scan.did}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {scan && scan.appGroups.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    <Heart className="h-3.5 w-3.5 text-[var(--support)] dark:text-emerald-400" aria-hidden />
                    {appCount} tool{appCount === 1 ? '' : 's'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                    <Layers className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                    {collectionCount} kind
                    {collectionCount === 1 ? '' : 's'} of data
                  </span>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-5 dark:border-zinc-700 dark:bg-zinc-900/30">
              <div className="mb-3 flex items-center gap-2 font-medium text-zinc-900 dark:text-zinc-100">
                <PlusCircle className="h-5 w-5 text-[var(--support)] dark:text-emerald-400" aria-hidden />
                Add more tools
              </div>
              <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                Paste extra names your developer or app gave you, even if
                they&apos;re not in your saved data yet. Separate with spaces or
                commas.
              </p>
              <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={selfReport}
                  onChange={(e) => setSelfReport(e.target.value)}
                  placeholder="e.g. blue.linkat.post"
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => runScan(parseSelfReportInput())}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <PlusCircle className="h-4 w-4" aria-hidden />
                  Add to list
                </button>
              </div>
            </section>
          </>
        )}

        <section className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-zinc-50 to-white p-6 dark:border-zinc-800 dark:from-zinc-900/50 dark:to-zinc-950">
          <div className="flex gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-zinc-600 shadow-sm dark:bg-zinc-800 dark:text-zinc-300"
              aria-hidden
            >
              <BookOpen className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
                For builders
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Building a tool? Add it to the directory so people can find ways
                to support you—no dependency on this app.
              </p>
              <a
                href="/maintainers"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--support)] dark:text-emerald-400"
              >
                How to add your project
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
