import type { AppProjectGroup } from '@/lib/funding'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import { pdslsCollectionUrl } from '@/lib/pdsls'
import Link from 'next/link'
import {
  ChevronDown,
  ExternalLink,
  Heart,
  HelpCircle,
  Server,
} from 'lucide-react'

function impliedOriginFromNsid(nsid: string): string | null {
  const raw = nsid.trim()
  if (!raw) return null

  // Some derived "keys" (e.g. calendar `createdWith`) may be full URLs.
  if (raw.includes('://')) {
    try {
      const u = new URL(raw)
      if (!u.hostname) return null
      return `${u.protocol}//${u.hostname}`
    } catch {
      // Fall through to best-effort parsing.
    }
  }

  const parts = raw.split('.').filter(Boolean)
  if (parts.length < 2) return null

  // Best-effort: use first two labels as NSID authority root.
  // Example: app.bsky.feed.post -> https://bsky.app
  const tld = parts[0]!.replace(/[^a-z0-9-]/gi, '')
  const root = parts[1]!.replace(/[^a-z0-9-]/gi, '')
  if (!tld || !root) return null
  return `https://${root}.${tld}`
}

function TechnicalDetails({
  did,
  collections,
  variant = 'support',
}: {
  did: string
  collections: string[]
  variant?: 'support' | 'discover'
}) {
  const summaryAccent =
    variant === 'discover'
      ? 'text-[var(--discover)] dark:text-amber-400'
      : 'text-[var(--support)] dark:text-emerald-400'
  const borderAccent =
    variant === 'discover'
      ? 'border-[var(--discover-border)] dark:border-amber-500/40'
      : 'border-[var(--support-border)] dark:border-emerald-500/40'
  const linkAccent =
    variant === 'discover'
      ? 'text-[var(--discover)] dark:text-amber-400'
      : 'text-[var(--support)] dark:text-emerald-400'

  return (
    <details className="project-disclosure group/disclosure mt-4 border-t border-zinc-200/80 pt-3 dark:border-zinc-800">
      <summary
        className={`flex cursor-pointer list-none items-center gap-2 text-sm font-medium ${summaryAccent} [&::-webkit-details-marker]:hidden`}
      >
        <ChevronDown
          aria-hidden
          className="disclosure-chevron h-4 w-4 shrink-0 transition-transform duration-200"
        />
        <span>Details</span>
        <span className="font-normal text-zinc-500 dark:text-zinc-400">
          ({collections.length}{' '}
          {collections.length === 1 ? 'match' : 'matches'})
        </span>
      </summary>
      <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
        These labels describe types of data your account has stored. Open the
        explorer if you want to see the raw view.
      </p>
      <ul
        className={`mt-3 max-w-xl space-y-2 border-l-2 pl-3 ${borderAccent}`}
      >
        {collections.map((c) => (
          <li
            key={c}
            className="font-mono text-xs text-zinc-700 break-all dark:text-zinc-300"
          >
            {c}{' '}
            <a
              href={pdslsCollectionUrl(did, c)}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1 font-sans text-sm underline underline-offset-2 ${linkAccent}`}
            >
              Open in explorer
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function PdsHostSupportCard({ funding }: { funding: PdsHostFunding }) {
  const title =
    funding.disclosure?.displayName ?? `Your host (${funding.pdsHostname})`
  const first = funding.links?.[0]
  const rest = funding.links ? funding.links.slice(1) : []

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
          {funding.disclosure?.landingPage && (
            <p className="mt-2 text-sm">
              <a
                href={funding.disclosure.landingPage}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-sky-700 underline underline-offset-2 dark:text-sky-400"
              >
                Website
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
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
          <div className="mt-4 flex flex-wrap gap-2">
            {first ? (
              <a
                href={first.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 dark:bg-sky-600"
              >
                {first.label}
                <ExternalLink className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              </a>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Not currently accepting contributions.
              </p>
            )}
            {rest.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white/80 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {l.label}
                <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </a>
            ))}
          </div>
        </div>
      </div>
    </article>
  )
}

export function KnownProjectCard({
  group,
  did,
}: {
  group: AppProjectGroup
  did: string
}) {
  const [first, ...rest] = group.links

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
            {group.appName}
          </h3>
          {group.notes && (
            <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
              {group.notes}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {first ? (
              <a
                href={first.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--support)] px-4 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90"
              >
                {first.label}
                <ExternalLink className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
              </a>
            ) : (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                We matched this project, but there are no web links in our list
                yet.
              </p>
            )}
            {rest.map((l) => (
              <a
                key={l.url}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white/80 px-3 py-2 text-sm text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                {l.label}
                <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
              </a>
            ))}
          </div>
          <TechnicalDetails
            did={did}
            collections={group.collections}
            variant="support"
          />
        </div>
      </div>
    </article>
  )
}

export function UnknownProjectCard({
  group,
  did,
}: {
  group: AppProjectGroup
  did: string
}) {
  const impliedOrigin = group.collections[0]
    ? impliedOriginFromNsid(group.collections[0])
    : null

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
            {impliedOrigin ?? group.appName}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            We don&apos;t have ways to give back listed for this tool yet. Your
            account has saved something from it—that&apos;s why it shows up
            here.
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
          <TechnicalDetails
            did={did}
            collections={group.collections}
            variant="discover"
          />
        </div>
      </div>
    </article>
  )
}
