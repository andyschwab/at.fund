'use client'

import Link from 'next/link'
import {
  AppWindow,
  ArrowRight,
  Banknote,
  HeartHandshake,
  LogIn,
  User,
  UserCog,
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
              Pay your builders
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
              Pay your builders
            </button>
          )}
        </div>

        {/* ── Four audiences ───────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-12">

          {/* Users */}
          <div className="relative flex flex-col gap-6 p-4 pb-8">
            <div className="flex items-center justify-center gap-4" aria-hidden>
              <User className="h-12 w-12 text-[var(--discover)]" strokeWidth={1.5} />
              <HeartHandshake className="h-7 w-7 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
              <UserCog className="h-12 w-12 text-[var(--discover)]" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Pay the builders you rely on
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Sign in to scan your Bluesky data — the tools, feeds, and
                labelers you use — and see every funding option each builder
                has published. Contribute directly, then endorse the projects
                you value to signal trust across the network.
              </p>
            </div>
            {hasSession ? (
              <Link
                href="/give"
                className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[var(--discover)] transition-opacity hover:opacity-80"
              >
                Pay your builders
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => {
                  document.cookie = 'returnTo=/give; path=/; max-age=300; SameSite=Lax'
                  const dialog = document.querySelector<HTMLDialogElement>('dialog')
                  dialog?.showModal()
                }}
                className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[var(--discover)] transition-opacity hover:opacity-80"
              >
                Pay your builders
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--background)] to-transparent" aria-hidden />
          </div>

          {/* Communities */}
          <div className="relative flex flex-col gap-6 p-4 pb-8">
            <div className="flex items-center justify-center gap-4" aria-hidden>
              <Users className="h-12 w-12 text-[var(--network)]" strokeWidth={1.5} />
              <HeartHandshake className="h-7 w-7 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
              <UserCog className="h-12 w-12 text-[var(--network)]" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Help the builders you depend on get paid
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                You run a list, a starter pack, or a project others rely on. You
                already know what&apos;s in the stack. Publish that — your
                community&apos;s sign-ins will surface every builder who deserves
                credit, not just you.
              </p>
            </div>
            <Link
              href="/setup"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[var(--network)] transition-opacity hover:opacity-80"
            >
              Share your dependencies
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--background)] to-transparent" aria-hidden />
          </div>

          {/* Builders */}
          <div className="relative flex flex-col gap-6 p-4 pb-8">
            <div className="flex items-center justify-center gap-4" aria-hidden>
              <Banknote className="h-12 w-12 text-[var(--support)]" strokeWidth={1.5} />
              <HeartHandshake className="h-7 w-7 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
              <UserCog className="h-12 w-12 text-[var(--support)]" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Make it easy for users to pay you
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Publish a few records from your ATProto account and you&apos;ll show
                up in anyone&apos;s scan who uses your work. Takes seconds. No
                dependency on this site — users find you through the protocol.
              </p>
            </div>
            <Link
              href="/setup"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-[var(--support)] transition-opacity hover:opacity-80"
            >
              Add your project
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--background)] to-transparent" aria-hidden />
          </div>

          {/* App builders */}
          <div className="relative flex flex-col gap-6 p-4 pb-8">
            <div className="flex items-center justify-center gap-4" aria-hidden>
              <AppWindow className="h-12 w-12 text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
              <HeartHandshake className="h-7 w-7 text-slate-300 dark:text-slate-600" strokeWidth={1.5} />
              <User className="h-12 w-12 text-slate-400 dark:text-slate-500" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Surface funding inside your app
              </h2>
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                The fund.at lexicon is open. Show funding links, display
                endorsement counts, or embed a compact funding card — all from
                protocol records, no routing through this site.
              </p>
            </div>
            <Link
              href="/lexicon"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 transition-opacity hover:opacity-80 dark:text-slate-300"
            >
              Read the guide
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[var(--background)] to-transparent" aria-hidden />
          </div>

        </div>

        {/* ── Footer links ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-6">
          <a
            href="https://github.com/andyschwab/at.fund"
            target="_blank"
            rel="noreferrer"
            aria-label="GitHub repository"
            className="text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
          >
            {/* GitHub mark */}
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
          </a>
          <a
            href="https://bsky.app/profile/at.fund"
            target="_blank"
            rel="noreferrer"
            aria-label="at.fund on Bluesky"
            className="text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
          >
            {/* Bluesky butterfly */}
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
              <path d="M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026" />
            </svg>
          </a>
        </div>

      </div>
    </div>
  )
}
