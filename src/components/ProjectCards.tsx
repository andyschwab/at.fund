import type { StewardCardModel } from '@/lib/steward-model'
import type { DisclosureMeta } from '@/lib/fund-at-records'
import type { PdsHostFunding } from '@/lib/atfund-steward'
import Link from 'next/link'
import {
  FileText,
  Globe,
  Heart,
  Mail,
  Megaphone,
  Scale,
  Cog,
  Shield,
} from 'lucide-react'

function disclosureMetaFromSteward(s: StewardCardModel): DisclosureMeta {
  return {
    displayName: s.displayName,
    description: s.description,
    landingPage: s.landingPage,
    contactGeneralUrl: s.contactGeneralUrl,
    contactGeneralEmail: s.contactGeneralEmail,
    contactPressUrl: s.contactPressUrl,
    contactPressEmail: s.contactPressEmail,
    securityPolicyUri: s.securityPolicyUri,
    securityContactUri: s.securityContactUri,
    privacyPolicyUri: s.privacyPolicyUri,
    termsOfServiceUri: s.termsOfServiceUri,
    donorTermsUri: s.donorTermsUri,
    taxDisclosureUri: s.taxDisclosureUri,
    softwareLicenseUri: s.softwareLicenseUri,
  }
}

/** Hostname-like steward URI → https URL for globe fallback. */
function websiteFallbackForStewardUri(stewardUri: string): string | undefined {
  if (stewardUri.startsWith('did:')) return undefined
  if (stewardUri.includes('/') || stewardUri.includes(':')) return undefined
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(stewardUri)) return `https://${stewardUri}`
  return undefined
}

/** Fixed disclosure “report card” slots (fund.at.disclosure), aligned with lexicon. */
type DisclosureSlot = {
  key: string
  label: string
  href: string | undefined
  Icon: typeof Globe
}

function buildDisclosureSlots(
  disclosure: DisclosureMeta | undefined,
  websiteFallback: string | undefined,
): DisclosureSlot[] {
  const d = disclosure
  const website = d?.landingPage ?? websiteFallback
  const contactHref =
    d?.contactGeneralUrl ??
    (d?.contactGeneralEmail
      ? `mailto:${d.contactGeneralEmail}`
      : undefined)
  const pressHref =
    d?.contactPressUrl ??
    (d?.contactPressEmail ? `mailto:${d.contactPressEmail}` : undefined)
  const securityHref = d?.securityPolicyUri ?? d?.securityContactUri

  return [
    { key: 'website', label: 'Website', Icon: Globe, href: website },
    { key: 'contact', label: 'Contact', Icon: Mail, href: contactHref },
    { key: 'press', label: 'Press', Icon: Megaphone, href: pressHref },
    { key: 'security', label: 'Security', Icon: Shield, href: securityHref },
    {
      key: 'privacy',
      label: 'Privacy policy',
      Icon: Scale,
      href: d?.privacyPolicyUri,
    },
    {
      key: 'terms',
      label: 'Terms of service',
      Icon: FileText,
      href: d?.termsOfServiceUri,
    },
    {
      key: 'donor',
      label: 'Donor terms',
      Icon: FileText,
      href: d?.donorTermsUri,
    },
    {
      key: 'tax',
      label: 'Tax disclosure',
      Icon: Scale,
      href: d?.taxDisclosureUri,
    },
    {
      key: 'license',
      label: 'Software license',
      Icon: FileText,
      href: d?.softwareLicenseUri,
    },
  ]
}

function DisclosureReportRow({ slots }: { slots: DisclosureSlot[] }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {slots.map((slot) => {
        const Icon = slot.Icon
        const active = !!slot.href
        if (!active) {
          return (
            <span
              key={slot.key}
              title={`Not published: ${slot.label}`}
              className="rounded-md p-1.5 text-zinc-300 dark:text-zinc-600"
            >
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
              <span className="sr-only">Not published: {slot.label}</span>
            </span>
          )
        }
        return (
          <a
            key={slot.key}
            href={slot.href}
            target="_blank"
            rel="noreferrer"
            title={slot.label}
            className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            <span className="sr-only">{slot.label}</span>
          </a>
        )
      })}
    </div>
  )
}

export function PdsHostSupportCard({
  pdsHostname,
  funding,
}: {
  pdsHostname: string
  funding?: PdsHostFunding | null
}) {
  const disclosure = funding?.disclosure
  const pdsStewardLabel = funding?.pdsStewardHandle ?? funding?.pdsStewardUri
  const stewardWebsiteFallback = funding?.pdsStewardUri
    ? websiteFallbackForStewardUri(funding.pdsStewardUri)
    : undefined
  const title =
    disclosure?.displayName ??
    (pdsStewardLabel
      ? `Your host steward (${pdsStewardLabel})`
      : `Your host (${pdsHostname})`)
  const contributeLink = funding?.links?.[0]
  const websiteFallback = stewardWebsiteFallback ?? `https://${pdsHostname}`
  const summary =
    disclosure?.description ??
    (pdsStewardLabel
      ? `Your account's home server (${pdsHostname}), operated by ${pdsStewardLabel}.`
      : `Your account's home server (${pdsHostname}) — support options if published.`)

  const disclosureSlots = buildDisclosureSlots(disclosure, websiteFallback)

  return (
    <article className="rounded-xl border border-zinc-200/90 border-l-4 border-l-sky-400/90 bg-gradient-to-br from-sky-50/90 to-white p-4 shadow-sm dark:border-zinc-800 dark:from-sky-950/40 dark:to-zinc-950">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          {contributeLink ? (
            <a
              href={contributeLink.url}
              target="_blank"
              rel="noreferrer"
              title={contributeLink.label}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-sky-600"
            >
              <Heart
                className="h-8 w-8 fill-current"
                strokeWidth={0}
                aria-hidden
              />
              <span className="sr-only">{contributeLink.label}</span>
            </a>
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-200/90 bg-white/60 text-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-600"
              title="No contribution link published"
            >
              <Heart className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {title}
            </h3>
            <div className="flex max-w-[45%] shrink-0 items-center gap-0.5 overflow-x-auto sm:max-w-none">
              <DisclosureReportRow slots={disclosureSlots} />
            </div>
            <Link
              href="/maintainers"
              className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Maintainers"
              aria-label="Maintainers"
            >
              <Cog className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {summary}
          </p>
          {pdsStewardLabel && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Steward: <span className="font-mono">{pdsStewardLabel}</span>
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

export function KnownStewardCard({ steward }: { steward: StewardCardModel }) {
  const contributeLink = steward.links?.[0]
  const websiteFallback = websiteFallbackForStewardUri(steward.stewardUri)
  const disclosure = disclosureMetaFromSteward(steward)

  const disclosureSlots = buildDisclosureSlots(disclosure, websiteFallback)

  return (
    <article className="rounded-xl border border-zinc-200/90 border-l-4 border-l-[var(--support-border)] bg-gradient-to-br from-[var(--support-muted)] to-white p-4 shadow-sm dark:border-zinc-800 dark:from-[var(--support-muted)] dark:to-zinc-950">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          {contributeLink ? (
            <a
              href={contributeLink.url}
              target="_blank"
              rel="noreferrer"
              title={contributeLink.label}
              className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--support)] text-[var(--support-foreground)] shadow-sm transition-opacity hover:opacity-90"
            >
              <Heart
                className="h-8 w-8 fill-current"
                strokeWidth={0}
                aria-hidden
              />
              <span className="sr-only">{contributeLink.label}</span>
            </a>
          ) : (
            <span
              className="flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-200/90 bg-white/60 text-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-600"
              title="No contribution link published"
            >
              <Heart className="h-8 w-8" strokeWidth={1.5} aria-hidden />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {steward.displayName}
            </h3>
            <div className="flex max-w-[45%] shrink-0 items-center gap-0.5 overflow-x-auto sm:max-w-none">
              <DisclosureReportRow slots={disclosureSlots} />
            </div>
            <Link
              href="/maintainers"
              className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Maintainers"
              aria-label="Maintainers"
            >
              <Cog className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
          {steward.description && (
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {steward.description}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

export function UnknownStewardCard({ steward }: { steward: StewardCardModel }) {
  const websiteFallback = websiteFallbackForStewardUri(steward.stewardUri)
  const disclosureSlots = buildDisclosureSlots(undefined, websiteFallback)

  return (
    <article className="relative overflow-hidden rounded-xl border border-dashed border-[var(--discover-border)] bg-[var(--discover-muted)] p-4 pl-5 before:absolute before:inset-y-3 before:left-0 before:w-1 before:rounded-full before:bg-[var(--discover)] before:content-[''] dark:border-amber-500/35 dark:bg-amber-500/[0.07]">
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col items-center gap-1">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-200/90 bg-white/60 text-zinc-300 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-600"
            title="No contribution link yet"
          >
            <Heart className="h-8 w-8" strokeWidth={1.5} aria-hidden />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {steward.displayName}
            </h3>
            <div className="flex max-w-[45%] shrink-0 items-center gap-0.5 overflow-x-auto sm:max-w-none">
              <DisclosureReportRow slots={disclosureSlots} />
            </div>
            <Link
              href="/maintainers"
              className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title="Maintainers"
              aria-label="Maintainers"
            >
              <Cog className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            Your account has saved something from this service—we don&apos;t have
            details about it yet.{' '}
            <Link
              href="/maintainers"
              className="font-medium text-[var(--discover)] underline underline-offset-2 dark:text-amber-400"
            >
              How projects get listed
            </Link>
          </p>
        </div>
      </div>
    </article>
  )
}
