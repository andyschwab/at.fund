'use client'

import Link from 'next/link'
import {
  AppWindow,
  ArrowRight,
  Banknote,
  HardHat,
  HeartHandshake,
  LogIn,
  User,
  Users,
} from 'lucide-react'
import { useSession } from '@/components/SessionContext'

const BURRITO_QUOTE_URL =
  'https://bsky.app/profile/burrito.space/post/3mi4ymt3lqs2k'

export function LandingPage() {
  const { hasSession } = useSession()

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-16 px-4 py-14">

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 text-center">
          <div className="space-y-3">
            <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
              <span className="inline-flex items-center font-mono font-medium text-slate-500 dark:text-slate-400">at<HeartHandshake className="inline-block h-[0.85em] w-[0.85em] translate-y-[0.04em] text-[var(--support)] mx-[0.12em]" strokeWidth={1.75} aria-hidden={true} />fund</span>
            </h1>
            <p className="text-xl font-medium text-slate-900 dark:text-slate-100 sm:text-2xl">
              We can just pay for things
              <sup className="ml-0.5 align-super text-sm font-normal leading-none">
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
            </p>
            <p className="text-base leading-relaxed text-slate-600 dark:text-slate-400">
              No VCs, no ads — just builders getting paid directly for the work
              you already rely on.
            </p>
          </div>

          {/* CTA button */}
          {hasSession ? (
            <Link
              href="/give"
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--support)] px-6 py-3 text-base font-medium text-[var(--support-foreground)] shadow-sm transition-opacity hover:opacity-90"
            >
              <LogIn className="h-5 w-5" aria-hidden />
              See who to support
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => {
                document.cookie = 'returnTo=/give; path=/; max-age=300; SameSite=Lax'
                const dialog = document.querySelector<HTMLDialogElement>('dialog')
                dialog?.showModal()
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--support)] px-6 py-3 text-base font-medium text-[var(--support-foreground)] shadow-sm transition-opacity hover:opacity-90"
            >
              <LogIn className="h-5 w-5" aria-hidden />
              See who to support
            </button>
          )}
        </div>

        {/* ── Four audiences ───────────────────────────────────────────── */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">

          {/* Users */}
          <div className="flex flex-col gap-4 rounded-2xl border border-[var(--discover-border)] bg-[var(--discover-muted)] p-6">
            <div className="flex items-center justify-center gap-2" aria-hidden>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--discover-border)] bg-white/70 text-[var(--discover)] dark:bg-slate-900/60">
                <User className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" strokeWidth={1.75} />
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--discover-border)] bg-white/70 text-[var(--discover)] dark:bg-slate-900/60">
                <HardHat className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </div>
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
            <div className="flex items-center justify-center gap-2" aria-hidden>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--network-border)] bg-white/70 text-[var(--network)] dark:bg-slate-900/60">
                <Users className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" strokeWidth={1.75} />
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--network-border)] bg-white/70 text-[var(--network)] dark:bg-slate-900/60">
                <HardHat className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </div>
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
              href="/setup"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[var(--network)] transition-opacity hover:opacity-80"
            >
              Learn how
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {/* Builders */}
          <div className="flex flex-col gap-4 rounded-2xl border border-[var(--support-border)] bg-[var(--support-muted)] p-6">
            <div className="flex items-center justify-center gap-2" aria-hidden>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--support-border)] bg-white/70 text-[var(--support)] dark:bg-slate-900/60">
                <Banknote className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" strokeWidth={1.75} />
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--support-border)] bg-white/70 text-[var(--support)] dark:bg-slate-900/60">
                <HardHat className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </div>
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
              href="/lexicon"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[var(--support)] transition-opacity hover:opacity-80"
            >
              Add your project
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          {/* App builders */}
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-6 dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-center gap-2" aria-hidden>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                <AppWindow className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <HeartHandshake className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" strokeWidth={1.75} />
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/70 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                <User className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Surface funding inside your app
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                The fund.at lexicon is open. Display funding options alongside
                the tools your users already have installed — no routing through
                this site required.
              </p>
            </div>
            <Link
              href="/lexicon"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 transition-opacity hover:opacity-80 dark:text-slate-300"
            >
              Read the lexicon
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

        </div>

      </div>
    </div>
  )
}
