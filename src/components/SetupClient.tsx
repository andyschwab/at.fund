'use client'

import { useState, useMemo, useId } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  HandCoins,
  Heart,
  HeartHandshake,
  LogOut,
  Plus,
  Trash2,
} from 'lucide-react'
import { KnownStewardCard } from '@/components/ProjectCards'
import type { StewardCardModel } from '@/lib/steward-model'
import type { FundAtResult } from '@/lib/fund-at-records'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LinkRow = { id: string; label: string; url: string }

type FormState = {
  // Core — always visible
  displayName: string
  description: string
  landingPage: string
  // Contributions — always visible
  links: LinkRow[]
  // Contact — expandable
  contactHandle: string
  contactEmail: string
  contactUrl: string
  pressEmail: string
  pressUrl: string
  // Security — expandable
  securityPolicyUri: string
  securityContactUri: string
  securityContactEmail: string
  // Legal — expandable
  legalEntityName: string
  jurisdiction: string
  privacyPolicyUri: string
  termsOfServiceUri: string
  donorTermsUri: string
  taxDisclosureUri: string
  softwareLicenseUri: string
  // Dependencies — expandable
  dependenciesText: string
  dependencyNotes: string
}

type Props = {
  did: string
  handle?: string
  existing: FundAtResult | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nextId() {
  return Math.random().toString(36).slice(2)
}

function initialFormState(existing: FundAtResult | null): FormState {
  const d = existing?.disclosure
  const links: LinkRow[] =
    existing?.links?.map((l) => ({ id: nextId(), label: l.label, url: l.url })) ?? []

  return {
    displayName: d?.displayName ?? '',
    description: d?.description ?? '',
    landingPage: d?.landingPage ?? '',
    links,
    contactHandle: d?.contactGeneralHandle ?? '',
    contactEmail: d?.contactGeneralEmail ?? '',
    contactUrl: d?.contactGeneralUrl ?? '',
    pressEmail: d?.contactPressEmail ?? '',
    pressUrl: d?.contactPressUrl ?? '',
    securityPolicyUri: d?.securityPolicyUri ?? '',
    securityContactUri: d?.securityContactUri ?? '',
    securityContactEmail: '',
    legalEntityName: '',
    jurisdiction: '',
    privacyPolicyUri: d?.privacyPolicyUri ?? '',
    termsOfServiceUri: d?.termsOfServiceUri ?? '',
    donorTermsUri: d?.donorTermsUri ?? '',
    taxDisclosureUri: d?.taxDisclosureUri ?? '',
    softwareLicenseUri: d?.softwareLicenseUri ?? '',
    dependenciesText: existing?.dependencyUris?.join('\n') ?? '',
    dependencyNotes: '',
  }
}

function parseDependencies(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldLabel({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string
  children: React.ReactNode
  hint?: string
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">
        {children}
      </span>
      {hint && (
        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </span>
      )}
    </label>
  )
}

function TextInput({
  id,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
    />
  )
}

function ExpandableSection({
  title,
  hint,
  children,
  filledCount,
}: {
  title: string
  hint: string
  children: React.ReactNode
  filledCount: number
}) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/60">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
        <span className="flex-1">
          <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
            {title}
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            {filledCount > 0 ? (
              <span className="text-[var(--support)]">
                {filledCount} field{filledCount !== 1 ? 's' : ''} filled
              </span>
            ) : (
              hint
            )}
          </span>
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-5 border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-800">
        {children}
      </div>
    </details>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SetupClient({ did, handle, existing }: Props) {
  const [form, setForm] = useState<FormState>(() => initialFormState(existing))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const uid = useId()
  const f = (name: string) => `${uid}-${name}`

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  // Link rows
  function addLink() {
    set('links', [...form.links, { id: nextId(), label: '', url: '' }])
  }

  function updateLink(id: string, field: 'label' | 'url', value: string) {
    set(
      'links',
      form.links.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    )
  }

  function removeLink(id: string) {
    set('links', form.links.filter((l) => l.id !== id))
  }

  // Live preview model
  const previewModel: StewardCardModel = useMemo(
    () => ({
      stewardUri: did,
      stewardDid: did,
      displayName: form.displayName.trim() || 'Your project name',
      description: form.description.trim() || undefined,
      landingPage: form.landingPage.trim() || undefined,
      links: form.links
        .filter((l) => l.label.trim() && l.url.trim())
        .map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
      source: 'fund.at',
      contactGeneralHandle: form.contactHandle.trim() || undefined,
      contactGeneralEmail: form.contactEmail.trim() || undefined,
      contactGeneralUrl: form.contactUrl.trim() || undefined,
      contactPressEmail: form.pressEmail.trim() || undefined,
      contactPressUrl: form.pressUrl.trim() || undefined,
      securityPolicyUri: form.securityPolicyUri.trim() || undefined,
      securityContactUri: form.securityContactUri.trim() || undefined,
      privacyPolicyUri: form.privacyPolicyUri.trim() || undefined,
      termsOfServiceUri: form.termsOfServiceUri.trim() || undefined,
      donorTermsUri: form.donorTermsUri.trim() || undefined,
      taxDisclosureUri: form.taxDisclosureUri.trim() || undefined,
      softwareLicenseUri: form.softwareLicenseUri.trim() || undefined,
    }),
    [form, did],
  )

  // Counts for expandable section badges
  const contactFilled = [
    form.contactHandle,
    form.contactEmail,
    form.contactUrl,
    form.pressEmail,
    form.pressUrl,
  ].filter((v) => v.trim()).length

  const securityFilled = [
    form.securityPolicyUri,
    form.securityContactUri,
    form.securityContactEmail,
  ].filter((v) => v.trim()).length

  const legalFilled = [
    form.legalEntityName,
    form.jurisdiction,
    form.privacyPolicyUri,
    form.termsOfServiceUri,
    form.donorTermsUri,
    form.taxDisclosureUri,
    form.softwareLicenseUri,
  ].filter((v) => v.trim()).length

  const depsFilled = form.dependenciesText.trim() ? 1 : 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.displayName.trim()) return

    setSaving(true)
    setErr(null)
    setSaved(false)

    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          description: form.description.trim() || undefined,
          landingPage: form.landingPage.trim() || undefined,
          contactHandle: form.contactHandle.trim() || undefined,
          contactEmail: form.contactEmail.trim() || undefined,
          contactUrl: form.contactUrl.trim() || undefined,
          pressEmail: form.pressEmail.trim() || undefined,
          pressUrl: form.pressUrl.trim() || undefined,
          securityPolicyUri: form.securityPolicyUri.trim() || undefined,
          securityContactUri: form.securityContactUri.trim() || undefined,
          securityContactEmail: form.securityContactEmail.trim() || undefined,
          legalEntityName: form.legalEntityName.trim() || undefined,
          jurisdiction: form.jurisdiction.trim() || undefined,
          privacyPolicyUri: form.privacyPolicyUri.trim() || undefined,
          termsOfServiceUri: form.termsOfServiceUri.trim() || undefined,
          donorTermsUri: form.donorTermsUri.trim() || undefined,
          taxDisclosureUri: form.taxDisclosureUri.trim() || undefined,
          softwareLicenseUri: form.softwareLicenseUri.trim() || undefined,
          links: form.links
            .filter((l) => l.label.trim() && l.url.trim())
            .map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
          dependencyUris: parseDependencies(form.dependenciesText),
          dependencyNotes: form.dependencyNotes.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Publish failed')
      setSaved(true)
    } catch (x) {
      setErr(
        x instanceof Error ? x.message : 'Something went wrong. Try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    await fetch('/oauth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  const displayId = handle ?? did

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-12">

        {/* Header */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <span
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--support-border)] bg-[var(--support-muted)] text-[var(--support)]"
              aria-hidden
            >
              <HeartHandshake className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href="/"
                  className="font-mono text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  AT.fund
                </Link>
                <span className="text-slate-300 dark:text-slate-600">/</span>
                <h1 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Set up your profile
                </h1>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Signed in as{' '}
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {displayId}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </header>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">

          {/* ---- Form ---- */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Core */}
            <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <HandCoins className="h-4 w-4 text-[var(--support)]" aria-hidden />
                About your project
              </div>

              <div>
                <FieldLabel htmlFor={f('name')}>
                  Project or business name{' '}
                  <span className="text-red-500" aria-hidden>*</span>
                </FieldLabel>
                <TextInput
                  id={f('name')}
                  value={form.displayName}
                  onChange={(v) => set('displayName', v)}
                  placeholder="My App"
                  disabled={saving}
                />
              </div>

              <div>
                <FieldLabel
                  htmlFor={f('desc')}
                  hint="One or two sentences — shown under your name on contribution cards."
                >
                  What you do
                </FieldLabel>
                <TextInput
                  id={f('desc')}
                  value={form.description}
                  onChange={(v) => set('description', v)}
                  placeholder="A short description of what you build or offer."
                  disabled={saving}
                />
              </div>

              <div>
                <FieldLabel htmlFor={f('site')} hint="Where people can learn more.">
                  Your website
                </FieldLabel>
                <TextInput
                  id={f('site')}
                  type="url"
                  value={form.landingPage}
                  onChange={(v) => set('landingPage', v)}
                  placeholder="https://example.com"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Contributions */}
            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  <Heart className="h-4 w-4 text-[var(--support)]" aria-hidden />
                  How people can support you
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add links to your funding pages — GitHub Sponsors, Patreon, Ko-fi,
                Open Collective, or anywhere you accept contributions. The first
                link is shown prominently.
              </p>

              {form.links.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {form.links.map((link, i) => (
                    <li key={link.id} className="flex items-start gap-2">
                      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => updateLink(link.id, 'label', e.target.value)}
                          placeholder={`Label (e.g. GitHub Sponsors)`}
                          aria-label={`Link ${i + 1} label`}
                          disabled={saving}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)] disabled:opacity-50 sm:w-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                        />
                        <input
                          type="url"
                          value={link.url}
                          onChange={(e) => updateLink(link.id, 'url', e.target.value)}
                          placeholder="https://"
                          aria-label={`Link ${i + 1} URL`}
                          disabled={saving}
                          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLink(link.id)}
                        disabled={saving}
                        aria-label="Remove link"
                        className="mt-2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 disabled:opacity-50 dark:hover:bg-slate-800"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={addLink}
                disabled={saving}
                className="inline-flex items-center gap-2 self-start rounded-lg border border-dashed border-[var(--support-border)] px-4 py-2 text-sm font-medium text-[var(--support)] transition-colors hover:bg-[var(--support-muted)] disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add a funding link
              </button>
            </div>

            {/* Contact */}
            <ExpandableSection
              title="Contact"
              hint="Your Bluesky handle, email, or contact page."
              filledCount={contactFilled}
            >
              <div>
                <FieldLabel
                  htmlFor={f('handle')}
                  hint="Your handle on the Atmosphere (e.g. you.bsky.social)."
                >
                  Bluesky / Atmosphere handle
                </FieldLabel>
                <TextInput
                  id={f('handle')}
                  value={form.contactHandle}
                  onChange={(v) => set('contactHandle', v)}
                  placeholder="you.bsky.social"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel htmlFor={f('email')}>General contact email</FieldLabel>
                <TextInput
                  id={f('email')}
                  type="email"
                  value={form.contactEmail}
                  onChange={(v) => set('contactEmail', v)}
                  placeholder="hello@example.com"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel htmlFor={f('contactUrl')}>Contact page URL</FieldLabel>
                <TextInput
                  id={f('contactUrl')}
                  type="url"
                  value={form.contactUrl}
                  onChange={(v) => set('contactUrl', v)}
                  placeholder="https://example.com/contact"
                  disabled={saving}
                />
              </div>
              <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                <p className="mb-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                  Press contact (optional)
                </p>
                <div className="flex flex-col gap-4">
                  <div>
                    <FieldLabel htmlFor={f('pressEmail')}>Press email</FieldLabel>
                    <TextInput
                      id={f('pressEmail')}
                      type="email"
                      value={form.pressEmail}
                      onChange={(v) => set('pressEmail', v)}
                      placeholder="press@example.com"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor={f('pressUrl')}>Press page URL</FieldLabel>
                    <TextInput
                      id={f('pressUrl')}
                      type="url"
                      value={form.pressUrl}
                      onChange={(v) => set('pressUrl', v)}
                      placeholder="https://example.com/press"
                      disabled={saving}
                    />
                  </div>
                </div>
              </div>
            </ExpandableSection>

            {/* Security */}
            <ExpandableSection
              title="Security"
              hint="Security policy and responsible disclosure contact."
              filledCount={securityFilled}
            >
              <div>
                <FieldLabel
                  htmlFor={f('secPolicy')}
                  hint="URL to your published security policy."
                >
                  Security policy URL
                </FieldLabel>
                <TextInput
                  id={f('secPolicy')}
                  type="url"
                  value={form.securityPolicyUri}
                  onChange={(v) => set('securityPolicyUri', v)}
                  placeholder="https://example.com/security"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor={f('secContact')}
                  hint="Where to report vulnerabilities."
                >
                  Security contact URL
                </FieldLabel>
                <TextInput
                  id={f('secContact')}
                  type="url"
                  value={form.securityContactUri}
                  onChange={(v) => set('securityContactUri', v)}
                  placeholder="https://example.com/security#contact"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel htmlFor={f('secEmail')}>Security contact email</FieldLabel>
                <TextInput
                  id={f('secEmail')}
                  type="email"
                  value={form.securityContactEmail}
                  onChange={(v) => set('securityContactEmail', v)}
                  placeholder="security@example.com"
                  disabled={saving}
                />
              </div>
            </ExpandableSection>

            {/* Legal */}
            <ExpandableSection
              title="Legal & trust"
              hint="Entity name, jurisdiction, privacy policy, terms, and tax info."
              filledCount={legalFilled}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor={f('entity')} hint="If you operate as a business.">
                    Legal entity name
                  </FieldLabel>
                  <TextInput
                    id={f('entity')}
                    value={form.legalEntityName}
                    onChange={(v) => set('legalEntityName', v)}
                    placeholder="Example Inc."
                    disabled={saving}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor={f('jurisdiction')} hint="Country or state where you operate.">
                    Jurisdiction
                  </FieldLabel>
                  <TextInput
                    id={f('jurisdiction')}
                    value={form.jurisdiction}
                    onChange={(v) => set('jurisdiction', v)}
                    placeholder="US"
                    disabled={saving}
                  />
                </div>
              </div>
              <div>
                <FieldLabel htmlFor={f('privacy')}>Privacy policy URL</FieldLabel>
                <TextInput
                  id={f('privacy')}
                  type="url"
                  value={form.privacyPolicyUri}
                  onChange={(v) => set('privacyPolicyUri', v)}
                  placeholder="https://example.com/privacy"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel htmlFor={f('terms')}>Terms of service URL</FieldLabel>
                <TextInput
                  id={f('terms')}
                  type="url"
                  value={form.termsOfServiceUri}
                  onChange={(v) => set('termsOfServiceUri', v)}
                  placeholder="https://example.com/terms"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor={f('donorTerms')}
                  hint="What contributors agree to when they support you."
                >
                  Donor terms URL
                </FieldLabel>
                <TextInput
                  id={f('donorTerms')}
                  type="url"
                  value={form.donorTermsUri}
                  onChange={(v) => set('donorTermsUri', v)}
                  placeholder="https://example.com/donor-terms"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor={f('tax')}
                  hint="Tax-deductible? Fiscal sponsor? Link your disclosure here."
                >
                  Tax disclosure URL
                </FieldLabel>
                <TextInput
                  id={f('tax')}
                  type="url"
                  value={form.taxDisclosureUri}
                  onChange={(v) => set('taxDisclosureUri', v)}
                  placeholder="https://example.com/tax-info"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor={f('license')}
                  hint="Link to the license for your software, if open source."
                >
                  Software license URL
                </FieldLabel>
                <TextInput
                  id={f('license')}
                  type="url"
                  value={form.softwareLicenseUri}
                  onChange={(v) => set('softwareLicenseUri', v)}
                  placeholder="https://github.com/you/repo/blob/main/LICENSE"
                  disabled={saving}
                />
              </div>
            </ExpandableSection>

            {/* Dependencies */}
            <ExpandableSection
              title="Your dependencies"
              hint="Projects yours depends on — so contributions can flow through the chain."
              filledCount={depsFilled}
            >
              <div>
                <FieldLabel
                  htmlFor={f('deps')}
                  hint="One per line or comma-separated. Use handles (alice.bsky.social), domains (example.com), or DIDs (did:plc:...)."
                >
                  Tools and services you depend on
                </FieldLabel>
                <textarea
                  id={f('deps')}
                  value={form.dependenciesText}
                  onChange={(e) => set('dependenciesText', e.target.value)}
                  placeholder={'bsky.app\nexample.com\ndid:plc:abc123'}
                  rows={4}
                  disabled={saving}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)] disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                />
              </div>
              <div>
                <FieldLabel
                  htmlFor={f('depNotes')}
                  hint="Optional human-readable context about these dependencies."
                >
                  Notes
                </FieldLabel>
                <TextInput
                  id={f('depNotes')}
                  value={form.dependencyNotes}
                  onChange={(v) => set('dependencyNotes', v)}
                  placeholder="e.g. These are the core infrastructure services we rely on."
                  disabled={saving}
                />
              </div>
            </ExpandableSection>

            {/* Submit */}
            <div className="flex flex-col gap-3">
              {err && (
                <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {err}
                </p>
              )}
              {saved && (
                <p className="flex items-center gap-2 text-sm text-[var(--support)]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                  Published — your records are live on your PDS.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving || !form.displayName.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--support)] px-5 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <Heart className="h-4 w-4" aria-hidden />
                  {saving ? 'Publishing…' : saved ? 'Publish again' : 'Publish records'}
                </button>
                <Link
                  href="/"
                  className="text-sm text-slate-500 underline underline-offset-2 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Back to your tools
                </Link>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Records are written to your ATProto PDS. They&apos;re public and
                discoverable by any AT.fund client or compatible tool.
              </p>
            </div>
          </form>

          {/* ---- Preview ---- */}
          <aside className="flex flex-col gap-3 lg:sticky lg:top-8 lg:self-start">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Preview — how you appear to supporters
            </p>
            <div className="pointer-events-none select-none">
              <KnownStewardCard steward={previewModel} />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Updates live as you fill in fields. The icon row lights up as you
              add more details.
            </p>
          </aside>

        </div>
      </div>
    </div>
  )
}
