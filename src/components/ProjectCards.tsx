import type { StewardCardModel } from '@/lib/steward-model'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import Link from 'next/link'
import {
  ExternalLink,
  Heart,
  HelpCircle,
  Server,
} from 'lucide-react'

export function PdsHostSupportCard({ funding }: { funding: PdsHostFunding }) {
  const title =
    funding.disclosure?.displayName ?? `Your host (${funding.pdsHostname})`
  const contributeLink = funding.links?.[0]

  return (
    <article className="rounded-xl border border-zinc-200/90 border-l-4 border-l-sky-400/90 bg-gradient-to-br from-sky-50/90 to-white p-5 shadow-sm dark:border-zinc-800 dark:from-sky-950/40 dark:to-zinc-950">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-400"
          aria-hidden
        >
          <Server className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {title}
          </h3>
          {funding.disclosure?.description && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {funding.disclosure.description}
            </p>
          )}
          {!funding.disclosure?.description && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              Your account&apos;s home server published disclosure metadata for (
              <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-zinc-800">
                {funding.pdsHostname}
              </code>
              ).
            </p>
          )}
          {funding.dependencyUris && funding.dependencyUris.length > 0 && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                Also depends on:
              </span>{' '}
              {funding.dependencyUris.join(', ')}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {funding.disclosure?.landingPage && (
              <a
                href={funding.disclosure.landingPage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white/80 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Website
                <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </a>
            )}
            {contributeLink && (
              <a
                href={contributeLink.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-sky-600"
              >
                {contributeLink.label}
                <ExternalLink className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export function KnownStewardCard({ steward }: { steward: StewardCardModel }) {
  const contributeLink = steward.links?.[0]

  return (
    <article className="rounded-xl border border-zinc-200/90 border-l-4 border-l-[var(--support-border)] bg-gradient-to-br from-[var(--support-muted)] to-white p-5 shadow-sm dark:border-zinc-800 dark:from-[var(--support-muted)] dark:to-zinc-950">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--support-muted)] text-[var(--support)] dark:text-emerald-400"
          aria-hidden
        >
          <Heart className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {steward.displayName}
          </h3>
          {steward.description && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {steward.description}
            </p>
          )}
          {steward.dependencies && steward.dependencies.length > 0 && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                Also depends on:
              </span>{' '}
              {steward.dependencies.join(', ')}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {steward.landingPage && (
              <a
                href={steward.landingPage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white/80 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Website
                <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </a>
            )}
            {contributeLink && (
              <a
                href={contributeLink.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90"
              >
                {contributeLink.label}
                <ExternalLink className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              </a>
            )}
            {!steward.landingPage && !contributeLink && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No website or funding links published yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export function UnknownStewardCard({ steward }: { steward: StewardCardModel }) {
  return (
    <article className="relative overflow-hidden rounded-xl border border-dashed border-[var(--discover-border)] bg-[var(--discover-muted)] p-5 pl-6 before:absolute before:inset-y-4 before:left-0 before:w-1 before:rounded-full before:bg-[var(--discover)] before:content-[''] dark:border-amber-500/35 dark:bg-amber-500/[0.07]">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--discover-muted)] text-[var(--discover)] dark:bg-amber-500/15 dark:text-amber-400"
          aria-hidden
        >
          <HelpCircle className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {steward.displayName}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Your account has saved something from this service—we don&apos;t have
            details about it yet.
          </p>
          <p className="mt-3 text-sm">
            <Link
              href="/maintainers"
              className="inline-flex items-center gap-1 font-medium text-[var(--discover)] underline underline-offset-2 dark:text-amber-400"
            >
              How projects get listed
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </p>
        </div>
      </div>
    </article>
  )
}
