'use client'

import { useState, useMemo } from 'react'
import type { ScanResult } from '@/lib/lexicon-scan'
import { pdslsRepoUrl } from '@/lib/pdsls'
import {
  FollowedAccountCard,
  KnownStewardCard,
  PdsHostSupportCard,
  UnknownStewardCard,
} from '@/components/ProjectCards'
import {
  AlertCircle,
  BookOpen,
  ExternalLink,
  HandCoins,
  Heart,
  HeartHandshake,
  LogIn,
  LogOut,
  Monitor,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Users,
  UserRound,
} from 'lucide-react'

const BURRITO_QUOTE_URL =
  'https://bsky.app/profile/burrito.space/post/3mi4ymt3lqs2k'

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

  const knownStewards = useMemo(
    () => scan?.stewards.filter((s) => s.source !== 'unknown') ?? [],
    [scan?.stewards],
  )
  const unknownStewards = useMemo(
    () => scan?.stewards.filter((s) => s.source === 'unknown') ?? [],
    [scan?.stewards],
  )
  const followedAccounts = scan?.followedAccounts ?? []

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
      if (!res.ok) throw new Error(data.detail || data.error || 'Login failed')
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
        body: JSON.stringify({ selfReportedStewards: extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Scan failed')
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

  const stewardCount = scan?.stewards.length ?? 0
  const followedCount = followedAccounts.length
  const displayId = scan?.handle ?? scan?.did ?? ''
  const pdsUrl = scan?.pdsUrl

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-12 px-4 py-12">
        <header className="text-center">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
            <span
              className="flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center rounded-2xl border border-[var(--support-border)] bg-[var(--support-muted)] text-[var(--support)] shadow-sm"
              aria-hidden
            >
              <HeartHandshake className="h-11 w-11" strokeWidth={1.75} />
            </span>
            <div className="w-full space-y-3">
              <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                <span className="font-mono font-medium text-slate-500 dark:text-slate-400">
                  AT.fund
                </span>
                <span className="text-slate-500 dark:text-slate-400">: </span>
                <span className="text-slate-900 dark:text-slate-100">
                  We can just pay for things
                  <sup className="ml-0.5 align-super text-lg font-normal leading-none">
                    <a
                      href={BURRITO_QUOTE_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--support)] underline decoration-[var(--support-border)] underline-offset-2 transition-opacity hover:opacity-80"
                      aria-label="@burrito.space on Bluesky"
                    >
                      *
                    </a>
                  </sup>
                </span>
              </h1>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Find ways to pay the people who build what you rely on.
              </p>
            </div>
          </div>
        </header>

        {!hasSession ? (
          <section className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
            <div className="mb-4 flex items-center gap-2 text-lg font-medium text-slate-900 dark:text-slate-100">
              <UserRound className="h-5 w-5 text-[var(--support)]" aria-hidden />
              Connect
            </div>
            <form onSubmit={login} className="flex max-w-md flex-col gap-3">
              <label className="text-sm text-slate-600 dark:text-slate-400">
                Your handle
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="you.bsky.social"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
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
              <details className="mt-2 max-w-md rounded-lg border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
                  <Monitor className="h-4 w-4 shrink-0" aria-hidden />
                  Local development
                  <span className="text-slate-400">▾</span>
                </summary>
                <p className="mt-2 pl-6 leading-relaxed">
                  Use <code className="font-mono text-slate-700 dark:text-slate-300">127.0.0.1</code>{' '}
                  (not <code className="font-mono">localhost</code>) so sign-in
                  redirects work.
                </p>
              </details>
            </form>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/90">
              <div className="flex flex-col gap-4 border-b border-slate-200/80 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--support-muted)] text-sm font-semibold text-[var(--support)]"
                    aria-hidden
                  >
                    {displayId ? userInitial(displayId) : '…'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Signed in
                    </p>
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {displayId || '…'}
                    </p>
                    {pdsUrl && (
                      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                        PDS: <span className="font-mono">{pdsUrl}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {scan?.did && (
                    <a
                      href={pdslsRepoUrl(scan.did)}
                      target="_blank"
                      rel="noreferrer"
                      title="Opens PDSls in a new tab"
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
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
                    className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <LogOut className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                </div>
              </div>
              {pdsUrl && (
                <div className="p-4 pt-4">
                  <PdsHostSupportCard
                    pdsHostname={new URL(pdsUrl).hostname}
                    funding={scan?.pdsHostFunding}
                  />
                </div>
              )}
            </section>

            {err && (
              <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {err}
              </p>
            )}

            {scan && scan.warnings && scan.warnings.length > 0 && (
              <details className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-amber-800 dark:text-amber-300 [&::-webkit-details-marker]:hidden">
                  <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                  {scan.warnings.length} lookup{scan.warnings.length === 1 ? '' : 's'} had issues
                  <span className="text-amber-600 dark:text-amber-500">▾</span>
                </summary>
                <ul className="mt-2 space-y-1 pl-6 text-amber-700 dark:text-amber-400">
                  {scan.warnings.map((w, i) => (
                    <li key={i}>
                      <span className="font-mono text-xs">{w.stewardUri}</span>: {w.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <section className="space-y-10">
              {!scan ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Could not load your projects.{' '}
                  <button
                    type="button"
                    onClick={() => runScan([])}
                    className="font-medium text-[var(--support)] underline"
                  >
                    Try again
                  </button>
                </p>
              ) : scan.stewards.length === 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  We didn&apos;t find any extra tools in your saved data yet. You
                  can add more below if you know them.
                </p>
              ) : (
                <>
                  {knownStewards.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/60 dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="flex gap-3 border-b border-[var(--support-border)]/50 bg-[var(--support-muted)] px-5 py-4 dark:border-[var(--support-border)]/35">
                        <span
                          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[var(--support)] shadow-sm dark:bg-slate-900/80"
                          aria-hidden
                        >
                          <HandCoins className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Tools you use
                          </h2>
                          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                            Services we matched from your saved data. Some have
                            ways to contribute directly.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-4 p-5">
                        {knownStewards.map((steward) => (
                          <KnownStewardCard
                            key={steward.stewardUri}
                            steward={steward}
                            allStewards={scan.stewards}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/60 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="flex gap-3 border-b border-[var(--network-border)]/50 bg-[var(--network-muted)] px-5 py-4 dark:border-[var(--network-border)]/35">
                      <span
                        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[var(--network)] shadow-sm dark:bg-slate-900/80"
                        aria-hidden
                      >
                        <Users className="h-5 w-5" strokeWidth={2} />
                      </span>
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          In your network
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                          People you follow who accept support via at.fund.
                        </p>
                      </div>
                    </div>
                    {followedAccounts.length > 0 ? (
                      <div className="flex flex-col gap-4 p-5">
                        {followedAccounts.map((account) => (
                          <FollowedAccountCard
                            key={account.did}
                            account={account}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="px-5 py-4 text-sm text-slate-500 dark:text-slate-400">
                        None of the accounts you follow have published at.fund
                        records yet. As more people adopt at.fund, they&apos;ll
                        show up here automatically.
                      </p>
                    )}
                  </div>

                  {unknownStewards.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white/60 dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="flex gap-3 border-b border-[var(--discover-border)]/60 bg-[var(--discover-muted)] px-5 py-4 dark:border-amber-500/25">
                        <span
                          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-[var(--discover)] shadow-sm dark:bg-slate-900/80 dark:text-amber-400"
                          aria-hidden
                        >
                          <Sparkles className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                            Still learning about these
                          </h2>
                          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                            Your account has something saved from these tools—we
                            don&apos;t have give-back links for them yet.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-4 p-5">
                        {unknownStewards.map((steward) => (
                          <UnknownStewardCard
                            key={steward.stewardUri}
                            steward={steward}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {scan && (stewardCount > 0 || followedCount > 0) && (
                <div className="flex flex-wrap gap-2">
                  {stewardCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <Heart className="h-3.5 w-3.5 text-[var(--support)]" aria-hidden />
                      {stewardCount} service{stewardCount === 1 ? '' : 's'}
                    </span>
                  )}
                  {followedCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      <Users className="h-3.5 w-3.5 text-[var(--network)]" aria-hidden />
                      {followedCount} in network
                    </span>
                  )}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-5 dark:border-slate-700 dark:bg-slate-900/30">
              <div className="mb-3 flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                <PlusCircle className="h-5 w-5 text-[var(--support)]" aria-hidden />
                Add more tools
              </div>
              <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
                Paste extra names your developer or app gave you, even if
                they&apos;re not in your saved data yet. Separate with spaces or
                commas.
              </p>
              <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={selfReport}
                  onChange={(e) => setSelfReport(e.target.value)}
                  placeholder="e.g. whtwnd.com or did:plc:..."
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
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

        <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 dark:border-slate-800 dark:from-slate-900/50 dark:to-slate-950">
          <div className="flex gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300"
              aria-hidden
            >
              <BookOpen className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                For builders
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Building a tool? Add it to the directory so people can find ways
                to support you—no dependency on this app.
              </p>
              <a
                href="/maintainers"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--support)]"
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
