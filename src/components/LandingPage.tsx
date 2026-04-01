'use client'

import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CreditCard,
  ExternalLink,
  GitBranch,
  LogIn,
  Monitor,
  Wrench,
} from 'lucide-react'

const BURRITO_QUOTE_URL =
  'https://bsky.app/profile/burrito.space/post/3mi4ymt3lqs2k'

type Props = {
  handle: string
  setHandle: (h: string) => void
  loading: boolean
  err: string | null
  onLogin: (e: React.FormEvent) => void
}

export function LandingPage({ handle, setHandle, loading, err, onLogin }: Props) {
  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 px-4 py-14">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
          <span
            className="flex h-[5.25rem] w-[5.25rem] shrink-0 items-center justify-center rounded-2xl border border-[var(--support-border)] bg-white shadow-sm dark:bg-slate-900"
            aria-hidden
          >
            <svg viewBox="0 0 44 44" className="h-11 w-11 text-[var(--support)]" fill="none" aria-hidden="true">
              <circle cx="22" cy="22" r="19" stroke="currentColor" strokeWidth="2" />
              <path d="M22 10 C14 18,13 22,13 27 A9 9 0 0 1 31 27 C31 22,30 18,22 10 Z" fill="currentColor" />
            </svg>
          </span>

          <div className="space-y-4">
            <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              <span className="inline-flex items-center font-mono font-medium text-slate-500 dark:text-slate-400">at<svg viewBox="0 0 10 14" className="inline-block h-[0.72em] w-[0.52em] translate-y-[0.04em] fill-[var(--support)] mx-[0.1em]" aria-hidden="true"><path d="M5 1 C2 5,1 8,1 10 A4 4 0 0 1 9 10 C9 8,8 5,5 1 Z" /></svg>fund</span>
              {' — '}
              <span className="text-slate-900 dark:text-slate-100">
                Keep your atmosphere clean
                <sup className="ml-0.5 align-super text-xl font-normal leading-none">
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
            <p className="text-base leading-relaxed text-slate-600 dark:text-slate-400">
              No VCs, no ads — just builders getting paid directly for the work
              you already rely on. Sign in with your Bluesky account and we&apos;ll
              show you how to support everything in your stack.
            </p>
          </div>

          {/* Sign-in form */}
          <form
            onSubmit={onLogin}
            className="w-full max-w-md space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/80"
          >
            <label className="block text-left text-sm text-slate-600 dark:text-slate-400">
              Your Bluesky handle
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
              <p className="flex items-start gap-2 text-left text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                {err}
              </p>
            )}
            <button
              type="submit"
              disabled={loading || !handle.trim()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <LogIn className="h-4 w-4" aria-hidden />
              {loading ? 'Redirecting…' : 'See who to support'}
            </button>
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
        </div>

        {/* ── Three audiences ──────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-3">

          {/* Users */}
          <div className="flex flex-col gap-4 rounded-2xl border border-[var(--discover-border)] bg-[var(--discover-muted)] p-6">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--discover-border)] bg-white/70 text-[var(--discover)] dark:bg-slate-900/60"
              aria-hidden
            >
              <CreditCard className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Pay the builders you rely on
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Sign in and we scan your Bluesky data — the tools, feeds, and
                labelers you use — and surface every funding option each builder
                has published. No digging around required.
              </p>
            </div>
          </div>

          {/* Communities */}
          <div className="flex flex-col gap-4 rounded-2xl border border-[var(--network-border)] bg-[var(--network-muted)] p-6">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--network-border)] bg-white/70 text-[var(--network)] dark:bg-slate-900/60"
              aria-hidden
            >
              <GitBranch className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Help the builders your people depend on get paid
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                You run a list, a starter pack, or a project others rely on. You
                already know what&apos;s in the stack. Publish that — and your
                community&apos;s sign-ins will surface every builder who deserves
                credit, not just you.
              </p>
            </div>
            <Link
              href="/maintainers"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[var(--network)] transition-opacity hover:opacity-80"
            >
              Learn how
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {/* Builders */}
          <div className="flex flex-col gap-4 rounded-2xl border border-[var(--support-border)] bg-[var(--support-muted)] p-6">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--support-border)] bg-white/70 text-[var(--support)] dark:bg-slate-900/60"
              aria-hidden
            >
              <Wrench className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Make it easy for users to pay you
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Publish a few records from your ATProto account and you&apos;ll show
                up in anyone&apos;s scan who uses your work. Takes minutes. No
                dependency on this site — users find you through the protocol.
              </p>
            </div>
            <Link
              href="/maintainers"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[var(--support)] transition-opacity hover:opacity-80"
            >
              Add your project
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>

        {/* ── Apps / lexicon callout ────────────────────────────────────── */}
        <div className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="flex gap-4">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm dark:bg-slate-800 dark:text-slate-400"
              aria-hidden
            >
              <BookOpen className="h-5 w-5" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Building with ATProto?
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                The fund.at lexicon is open. Use it to surface contribution info
                inside your own app — display funding options alongside the
                tools your users already have installed, without routing them
                through this site.
              </p>
              <a
                href="/lexicon"
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 transition-opacity hover:opacity-80 dark:text-slate-300"
              >
                Read the lexicon
                <ExternalLink className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
