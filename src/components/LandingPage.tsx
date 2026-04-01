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
                Sign in and we scan your Bluesky data — the tools, feeds, and
                labelers you use — and surface every funding option each builder
                has published. No digging around required.
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
                already know what&apos;s in the stack. Publish that — and your
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
              <path d="M12 10.8c-1.087-2.114-4.046-6.053-6.798-7.995C3.566.944 1.561 1.266.902 1.565.139 1.908-.051 3.094.004 3.954c.106 1.65.567 3.217 1.408 4.317C2.688 8.27 4.04 9.338 6.435 9.337c1.527 0 2.7-.573 3.715-1.282-.15.544-.35 1.079-.545 1.522-.902 2.093-2.016 4.058-2.804 5.54-.895 1.7-2.01 3.393-2.886 4.97-.3.538-.6 1.098-.878 1.576-.35.601-.388 1.366-.129 2.099.36 1.003 1.283 1.555 2.306 1.488.803-.053 1.666-.386 2.44-.807C11.696 22.657 12 22.274 12 22.274s.304.383.941.916c.774.421 1.637.754 2.44.807 1.023.067 1.946-.485 2.306-1.488.259-.733.221-1.498-.129-2.099-.278-.478-.578-1.038-.878-1.576-.876-1.577-1.991-3.27-2.886-4.97-.788-1.482-1.902-3.447-2.804-5.54-.195-.443-.395-.978-.545-1.522 1.015.709 2.188 1.282 3.715 1.282 2.395.001 3.747-1.067 4.023-2.066.841-1.1 1.302-2.667 1.408-4.317.055-.86-.135-2.046-.898-2.389C19.439 1.266 17.434.944 15.798 2.805 13.046 4.747 13.087 8.686 12 10.8z" />
            </svg>
          </a>
        </div>

      </div>
    </div>
  )
}
