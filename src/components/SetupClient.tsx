'use client'

import { useState, useMemo, useEffect, useId } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  Heart,
  HeartHandshake,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react'
import { DropletIcon } from '@/components/DropletIcon'
import { StewardCard } from '@/components/ProjectCards'
import { HandleChipInput } from '@/components/HandleChipInput'
import type { ChipItem } from '@/components/HandleChipInput'
import type { StewardEntry } from '@/lib/steward-model'
import type { FundingChannel, FundingPlan } from '@/lib/funding-manifest'
import type { FundAtResult } from '@/lib/fund-at-records'
import { validateUrl } from '@/lib/validate'
import { useSession } from '@/components/SessionContext'
import { nextId } from '@/lib/next-id'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DependencyRow = ChipItem

type ChannelRow = {
  id: string
  slug: string
  type: string
  uri: string
  description: string
}

type PlanRow = {
  id: string
  slug: string
  name: string
  description: string
  amount: string
  currency: string
  frequency: string
  channels: string[]  // references channel slugs
}

type FormState = {
  contributeUrl: string
  dependencies: DependencyRow[]
  channels: ChannelRow[]
  plans: PlanRow[]
}

type Props = {
  did: string
  handle?: string
  existing: FundAtResult | null
}

function initialFormState(existing: FundAtResult | null): FormState {
  const dependencies: DependencyRow[] =
    existing?.dependencies?.map((d) => ({
      id: nextId(),
      uri: d.uri,
      label: d.label ?? '',
    })) ?? []

  const channels: ChannelRow[] =
    existing?.channels?.map((ch) => ({
      id: nextId(),
      slug: ch.guid,
      type: ch.type,
      uri: ch.address,
      description: ch.description ?? '',
    })) ?? []

  const plans: PlanRow[] =
    existing?.plans?.map((p) => ({
      id: nextId(),
      slug: p.guid,
      name: p.name,
      description: p.description ?? '',
      amount: p.amount > 0 ? String(p.amount) : '',
      currency: p.currency,
      frequency: p.frequency,
      channels: p.channels,
    })) ?? []

  return {
    contributeUrl: existing?.contributeUrl ?? '',
    dependencies,
    channels,
    plans,
  }
}

/**
 * Run a validator only on non-empty values. Returns null for blank (optional).
 */
function check(
  value: string,
  validator: (v: string) => string | null,
): string | null {
  const t = value.trim()
  if (!t) return null
  return validator(t)
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
  validate,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  disabled?: boolean
  validate?: (v: string) => string | null
}) {
  const trimmed = value.trim()
  const error = trimmed ? validate?.(trimmed) ?? null : null
  const valid = trimmed && !error

  const borderColor = error
    ? 'border-red-400 focus:border-red-500 focus:ring-red-400/30'
    : valid
      ? 'border-[var(--support-border)] focus:border-[var(--support)] focus:ring-[var(--support)]/30'
      : 'border-slate-300 focus:border-[var(--support)] focus:ring-[var(--support)]/30 dark:border-slate-700'

  return (
    <div>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 disabled:opacity-50 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 ${borderColor}`}
      />
      {error && (
        <p className="mt-1 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SetupClient({ did, handle, existing }: Props) {
  const { authFetch } = useSession()
  const [form, setForm] = useState<FormState>(() => initialFormState(existing))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [migrating, setMigrating] = useState(false)
  const [migrated, setMigrated] = useState(false)

  const uid = useId()
  const f = (name: string) => `${uid}-${name}`

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const contributeUrlError = useMemo(
    () => check(form.contributeUrl, validateUrl),
    [form.contributeUrl],
  )

  const validChannels = form.channels.filter((ch) => ch.slug.trim() && ch.uri.trim())

  const hasErrors = !!contributeUrlError

  // Fetch enriched profile for the user's own entry (avatar, description, etc.)
  const [enriched, setEnriched] = useState<StewardEntry | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/entry?uri=${encodeURIComponent(did)}`)
      .then((r) => r.json())
      .then((data: { entry?: StewardEntry }) => {
        if (!cancelled && data.entry) setEnriched(data.entry)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [did])

  // Build live preview channels/plans from form state
  const previewChannels: FundingChannel[] | undefined = useMemo(() => {
    if (validChannels.length === 0) return undefined
    return validChannels.map((ch) => ({
      guid: ch.slug.trim(),
      type: (ch.type || 'other') as 'payment-provider' | 'bank' | 'other',
      address: ch.uri.trim(),
      description: ch.description.trim() || undefined,
    }))
  }, [validChannels])

  const previewPlans: FundingPlan[] | undefined = useMemo(() => {
    const valid = form.plans.filter((p) => p.slug.trim() && p.name.trim())
    if (valid.length === 0) return undefined
    return valid.map((p) => ({
      guid: p.slug.trim(),
      status: 'active' as const,
      name: p.name.trim(),
      description: p.description.trim() || undefined,
      amount: parseFloat(p.amount) || 0,
      currency: p.currency || 'USD',
      frequency: (p.frequency || 'other') as 'one-time' | 'monthly' | 'yearly' | 'other',
      channels: p.channels.length > 0 ? p.channels : [],
    }))
  }, [form.plans])

  // Live preview model — form fields override, enriched fields fill in the rest
  const previewModel: StewardEntry = useMemo(
    () => ({
      uri: did,
      did: did,
      handle: handle ?? undefined,
      tags: enriched?.tags ?? (['tool'] as const),
      displayName: enriched?.displayName ?? handle ?? did,
      description: enriched?.description,
      avatar: enriched?.avatar,
      landingPage: enriched?.landingPage,
      capabilities: enriched?.capabilities,
      contributeUrl: contributeUrlError ? undefined : form.contributeUrl.trim() || undefined,
      dependencies: form.dependencies
        .filter((d) => d.uri.trim())
        .map((d) => d.uri.trim()),
      source: 'fund.at' as const,
      channels: previewChannels,
      plans: previewPlans,
    }),
    [form, did, handle, contributeUrlError, enriched, previewChannels, previewPlans],
  )

  // Resolve dependency entries so the preview card can show enriched info
  const [resolvedDeps, setResolvedDeps] = useState<StewardEntry[]>([])

  const depUris = useMemo(
    () => previewModel.dependencies ?? [],
    [previewModel.dependencies],
  )

  useEffect(() => {
    if (depUris.length === 0) {
      setResolvedDeps([])
      return
    }

    let cancelled = false

    Promise.allSettled(
      depUris.map((uri) =>
        fetch(`/api/entry?uri=${encodeURIComponent(uri)}`)
          .then((r) => r.json())
          .then((data: { entry?: StewardEntry; referenced?: StewardEntry[] }) => {
            const entries: StewardEntry[] = []
            if (data.entry) entries.push(data.entry)
            if (data.referenced) entries.push(...data.referenced)
            return entries
          })
          .catch(() => [] as StewardEntry[])
      )
    ).then((results) => {
      if (cancelled) return
      setResolvedDeps(
        results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      )
    })

    return () => { cancelled = true }
  }, [depUris])

  async function handleMigrate() {
    setMigrating(true)
    setErr(null)
    try {
      const res = await authFetch('/api/migrate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || data.error || 'Migration failed')
      setMigrated(true)
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Migration failed. Try again.')
    } finally {
      setMigrating(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (hasErrors) return

    setSaving(true)
    setErr(null)
    setSaved(false)

    try {
      const channelsPayload = validChannels.length > 0
        ? validChannels.map((ch) => ({
            id: ch.slug.trim(),
            type: ch.type || 'other',
            uri: ch.uri.trim(),
            ...(ch.description.trim() && { description: ch.description.trim() }),
          }))
        : undefined

      const plansPayload = form.plans.filter((p) => p.slug.trim() && p.name.trim())
      const plansList = plansPayload.length > 0
        ? plansPayload.map((p) => ({
            id: p.slug.trim(),
            name: p.name.trim(),
            ...(p.description.trim() && { description: p.description.trim() }),
            amount: parseFloat(p.amount) || 0,
            currency: p.currency || 'USD',
            frequency: p.frequency || 'other',
            ...(p.channels.length > 0 && { channels: p.channels }),
          }))
        : undefined

      const res = await authFetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributeUrl: form.contributeUrl.trim() || undefined,
          dependencies: form.dependencies
            .filter((d) => d.uri.trim())
            .map((d) => ({
              uri: d.uri.trim(),
              ...(d.label.trim() && { label: d.label.trim() }),
            })),
          channels: channelsPayload,
          plans: plansList,
          existing: existing ? {
            contributeUrl: existing.contributeUrl || undefined,
            dependencies: existing.dependencies?.map((d) => ({ uri: d.uri })),
            channelIds: existing.channels?.map((c) => c.guid),
            planIds: existing.plans?.map((p) => p.guid),
          } : undefined,
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

  return (
    <div className="page-wash min-h-full">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8">

        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Set up your profile
        </h1>

        {/* Preview -- sticky at top while scrolling */}
        <section className="sticky top-12 z-10 -mx-4 border-b border-slate-200/80 bg-[var(--background)]/95 px-4 pb-4 pt-2 backdrop-blur dark:border-slate-800">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Preview — how you appear in others&apos; give lists
          </p>
          <ul className="pointer-events-none select-none divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900/60">
            <StewardCard entry={previewModel} allEntries={resolvedDeps} />
          </ul>
        </section>

        {/* Migration banner */}
        {existing?.needsMigration && !migrated && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Your records use an older format
            </p>
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
              We&apos;ve restructured the fund.at lexicons into grouped namespaces
              (fund.at.funding.*, fund.at.graph.*). Your existing data will continue
              to work, but migrating ensures compatibility going forward.
            </p>
            <button
              type="button"
              onClick={handleMigrate}
              disabled={migrating}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {migrating ? 'Migrating…' : 'Update my records'}
            </button>
          </div>
        )}
        {migrated && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--support-border)] bg-[var(--support-muted)] p-4">
            <CheckCircle2 className="h-4 w-4 text-[var(--support)]" />
            <p className="text-sm text-[var(--support)]">
              Records migrated successfully. Your data is now in the latest format.
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Contribute URL */}
            <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Heart className="h-4 w-4 text-[var(--support)]" aria-hidden />
                How people can support you
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add a link to your funding page -- GitHub Sponsors, Patreon, Ko-fi,
                Open Collective, or anywhere you accept contributions.
              </p>

              <div>
                <FieldLabel
                  htmlFor={f('contributeUrl')}
                  hint="The URL where people can support your project financially."
                >
                  Funding page URL
                </FieldLabel>
                <TextInput
                  id={f('contributeUrl')}
                  value={form.contributeUrl}
                  onChange={(v) => set('contributeUrl', v)}
                  placeholder="https://github.com/sponsors/you"
                  disabled={saving}
                  validate={validateUrl}
                />
              </div>
            </div>

            {/* Funding channels & plans */}
            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Wallet className="h-4 w-4 text-[var(--support)]" aria-hidden />
                Payment channels
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Where people can send you money — GitHub Sponsors, Open Collective,
                Ko-fi, PayPal, or any payment URL. Each channel and plan is published as an
                individual record on your PDS with DID-signed provenance.
                Also compatible with the{' '}
                <a href="https://fundingjson.org/" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200">
                  funding.json
                </a>{' '}
                open standard.
              </p>

              {form.channels.map((ch, i) => (
                <div key={ch.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                  <div className="flex items-center gap-2">
                    <input
                      value={ch.slug}
                      onChange={(e) => {
                        const updated = [...form.channels]
                        updated[i] = { ...ch, slug: e.target.value }
                        set('channels', updated)
                      }}
                      placeholder="github-sponsors"
                      disabled={saving}
                      className="w-36 rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-700 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <select
                      value={ch.type}
                      onChange={(e) => {
                        const updated = [...form.channels]
                        updated[i] = { ...ch, type: e.target.value }
                        set('channels', updated)
                      }}
                      disabled={saving}
                      className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-[var(--support)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <option value="payment-provider">Payment provider</option>
                      <option value="bank">Bank</option>
                      <option value="other">Other</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => set('channels', form.channels.filter((_, j) => j !== i))}
                      disabled={saving}
                      className="ml-auto text-slate-400 hover:text-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    value={ch.uri}
                    onChange={(e) => {
                      const updated = [...form.channels]
                      updated[i] = { ...ch, uri: e.target.value }
                      set('channels', updated)
                    }}
                    placeholder="https://github.com/sponsors/you"
                    disabled={saving}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={() => set('channels', [...form.channels, { id: nextId(), slug: '', type: 'payment-provider', uri: '', description: '' }])}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--support)] hover:opacity-80 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add channel
              </button>

              {/* Plans — only show if there are channels */}
              {form.channels.length > 0 && (
                <>
                  <div className="mt-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Plans <span className="font-normal text-slate-400">(optional)</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                      Suggested tiers — supporters choose which fits them.
                    </p>
                  </div>

                  {form.plans.map((plan, i) => (
                    <div key={plan.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                      <div className="flex items-center gap-2">
                        <input
                          value={plan.slug}
                          onChange={(e) => {
                            const updated = [...form.plans]
                            updated[i] = { ...plan, slug: e.target.value }
                            set('plans', updated)
                          }}
                          placeholder="supporter"
                          disabled={saving}
                          className="w-28 rounded border border-slate-200 bg-white px-2 py-1.5 font-mono text-xs text-slate-700 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                        <input
                          value={plan.name}
                          onChange={(e) => {
                            const updated = [...form.plans]
                            updated[i] = { ...plan, name: e.target.value }
                            set('plans', updated)
                          }}
                          placeholder="Supporter"
                          disabled={saving}
                          className="flex-1 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => set('plans', form.plans.filter((_, j) => j !== i))}
                          disabled={saving}
                          className="text-slate-400 hover:text-red-500 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          value={plan.amount}
                          onChange={(e) => {
                            const updated = [...form.plans]
                            updated[i] = { ...plan, amount: e.target.value }
                            set('plans', updated)
                          }}
                          placeholder="5"
                          disabled={saving}
                          className="w-20 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                        <input
                          value={plan.currency}
                          onChange={(e) => {
                            const updated = [...form.plans]
                            updated[i] = { ...plan, currency: e.target.value.toUpperCase() }
                            set('plans', updated)
                          }}
                          placeholder="USD"
                          maxLength={3}
                          disabled={saving}
                          className="w-16 rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                        <select
                          value={plan.frequency}
                          onChange={(e) => {
                            const updated = [...form.plans]
                            updated[i] = { ...plan, frequency: e.target.value }
                            set('plans', updated)
                          }}
                          disabled={saving}
                          className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:border-[var(--support)] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                          <option value="one-time">One-time</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => set('plans', [...form.plans, { id: nextId(), slug: '', name: '', description: '', amount: '', currency: 'USD', frequency: 'monthly', channels: [] }])}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-xs font-medium text-[var(--support)] hover:opacity-80 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add plan
                  </button>
                </>
              )}
            </div>

            {/* Dependencies */}
            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <HeartHandshake className="h-4 w-4 text-[var(--support)]" aria-hidden />
                Your dependencies
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Projects yours depends on -- so contributions can flow through the
                chain. Use handles (alice.bsky.social), domains (example.com), or
                DIDs (did:plc:...).
              </p>

              <HandleChipInput
                chips={form.dependencies}
                onChange={(deps) => set('dependencies', deps)}
                disabled={saving}
              />
            </div>

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
                  Published -- your records are live on your PDS.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={saving || hasErrors}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--support)] px-5 py-2.5 text-sm font-medium text-[var(--support-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <DropletIcon className="h-4 w-4" aria-hidden />
                  {saving ? 'Publishing…' : saved ? 'Publish again' : 'Publish records'}
                </button>
                <Link
                  href="/give"
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
      </div>
    </div>
  )
}
