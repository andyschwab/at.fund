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
import { detectPlatform, PLATFORM_LABELS } from '@/lib/funding-manifest'
import type { FundAtResult } from '@/lib/fund-at-records'
import { validateUrl } from '@/lib/validate'
import { useSession } from '@/components/SessionContext'
import { nextId } from '@/lib/next-id'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DependencyRow = ChipItem

/**
 * Combined channel + plan row. One form row = one "way to support me."
 * Behind the scenes, each row writes up to two records:
 *   - fund.at.funding.channel/channel-{seq}
 *   - fund.at.funding.plan/plan-{seq}   (only if amount is set)
 */
type FundingRow = {
  id: string
  /** Stable sequence number used as record key: channel-{seq} / plan-{seq} */
  seq: number
  uri: string
  /** User-editable label. Empty = auto-derived from URL. */
  label: string
  /** Plan name (optional — defaults to label if amount is set). */
  name: string
  amount: string
  currency: string
  frequency: string
}

// ---------------------------------------------------------------------------
// Auto-derive channel slug and type from URL
// ---------------------------------------------------------------------------

function baseSlugFromUri(uri: string): string {
  const trimmed = uri.trim()
  if (!trimmed) return ''
  const platform = detectPlatform(trimmed)
  if (platform) return platform
  try {
    return new URL(trimmed).hostname.replace(/^www\./, '').replace(/\./g, '-')
  } catch {
    return ''
  }
}

function baseLabelFromUri(uri: string): string {
  const trimmed = uri.trim()
  if (!trimmed) return ''
  const platform = detectPlatform(trimmed)
  if (platform) return PLATFORM_LABELS[platform]
  try {
    return new URL(trimmed).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

function deriveChannelType(uri: string): string {
  if (detectPlatform(uri.trim())) return 'payment-provider'
  return 'payment-provider'
}


type FormState = {
  contributeUrl: string
  dependencies: DependencyRow[]
  rows: FundingRow[]
  /** Next sequence number for new rows */
  nextSeq: number
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

  // Merge existing channels + plans into combined rows.
  // Match plans to channels by GUID reference. Unmatched channels get no plan
  // fields; unmatched plans become standalone rows (URL-less).
  const rows: FundingRow[] = []
  let seq = 1

  // Index plans by which channel they reference
  const planByChannel = new Map<string, FundingPlan>()
  const matchedPlanGuids = new Set<string>()

  for (const plan of existing?.plans ?? []) {
    // A plan references channels by guid. In our simplified UI, a plan maps
    // to one channel. Take the first channel reference.
    if (plan.channels.length > 0) {
      for (const chRef of plan.channels) {
        // chRef may be a full AT URI or a bare slug — extract the slug
        const slug = chRef.includes('/') ? chRef.split('/').pop()! : chRef
        planByChannel.set(slug, plan)
      }
    }
  }

  for (const ch of existing?.channels ?? []) {
    const plan = planByChannel.get(ch.guid)
    if (plan) matchedPlanGuids.add(plan.guid)
    rows.push({
      id: nextId(),
      seq: seq++,
      uri: ch.address,
      label: '',  // auto-derived from URL
      name: plan?.name ?? '',
      amount: plan && plan.amount > 0 ? String(plan.amount) : '',
      currency: plan?.currency ?? 'USD',
      frequency: plan?.frequency ?? 'monthly',
    })
  }

  // Standalone plans without a matching channel (rare, but handle gracefully)
  for (const plan of existing?.plans ?? []) {
    if (matchedPlanGuids.has(plan.guid)) continue
    rows.push({
      id: nextId(),
      seq: seq++,
      uri: '',
      label: '',
      name: plan.name,
      amount: plan.amount > 0 ? String(plan.amount) : '',
      currency: plan.currency,
      frequency: plan.frequency,
    })
  }

  return {
    contributeUrl: existing?.contributeUrl ?? '',
    dependencies,
    rows,
    nextSeq: seq,
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

  const validRows = useMemo(
    () => form.rows.filter((r) => r.uri.trim() && baseSlugFromUri(r.uri)),
    [form.rows],
  )

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
    if (validRows.length === 0) return undefined
    return validRows.map((r) => ({
      guid: `channel-${r.seq}`,
      type: deriveChannelType(r.uri) as FundingChannel['type'],
      address: r.uri.trim(),
    }))
  }, [validRows])

  const previewPlans: FundingPlan[] | undefined = useMemo(() => {
    const withAmount = validRows.filter((r) => parseFloat(r.amount) > 0)
    if (withAmount.length === 0) return undefined
    return withAmount.map((r) => {
      const label = r.name.trim() || r.label.trim() || baseLabelFromUri(r.uri)
      return {
        guid: `plan-${r.seq}`,
        status: 'active' as const,
        name: label,
        amount: parseFloat(r.amount) || 0,
        currency: r.currency || 'USD',
        frequency: (r.frequency || 'monthly') as FundingPlan['frequency'],
        channels: [`channel-${r.seq}`],
      }
    })
  }, [validRows])

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

  // Derive directly from form state (stable reference) — NOT from previewModel
  // which recalculates every render due to unmemoized validRows.
  const depUris = useMemo(
    () => form.dependencies.filter((d) => d.uri.trim()).map((d) => d.uri.trim()),
    [form.dependencies],
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
      // Build paired channel + plan payloads from combined rows
      const channelsPayload = validRows.length > 0
        ? validRows.map((r) => ({
            id: `channel-${r.seq}`,
            type: deriveChannelType(r.uri),
            uri: r.uri.trim(),
          }))
        : undefined

      const rowsWithPlans = validRows.filter((r) => parseFloat(r.amount) > 0)
      const plansList = rowsWithPlans.length > 0
        ? rowsWithPlans.map((r) => {
            const label = r.name.trim() || r.label.trim() || baseLabelFromUri(r.uri)
            return {
              id: `plan-${r.seq}`,
              name: label,
              amount: parseFloat(r.amount) || 0,
              currency: r.currency || 'USD',
              frequency: r.frequency || 'monthly',
              channels: [`channel-${r.seq}`],
            }
          })
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

            {/* Payment channels — combined channel + plan rows */}
            <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Wallet className="h-4 w-4 text-[var(--support)]" aria-hidden />
                Payment channels
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Add your funding links. We&apos;ll detect the platform automatically.
                Optionally set a suggested amount for each.
              </p>

              {form.rows.map((row, i) => {
                const autoLabel = baseLabelFromUri(row.uri)
                const displayLabel = row.label.trim() || autoLabel
                return (
                  <div key={row.id} className="flex flex-col gap-2 rounded-lg border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/30">
                    {/* Row 1: platform badge + URL + delete */}
                    <div className="flex items-center gap-2">
                      {row.uri.trim() && (
                        <input
                          value={row.label}
                          onChange={(e) => {
                            const updated = [...form.rows]
                            updated[i] = { ...row, label: e.target.value }
                            set('rows', updated)
                          }}
                          placeholder={displayLabel || 'Label'}
                          disabled={saving}
                          className="w-36 shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-center text-[11px] font-medium text-emerald-700 placeholder-emerald-500/60 focus:border-emerald-400 focus:outline-none dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:placeholder-emerald-400/40"
                        />
                      )}
                      <input
                        value={row.uri}
                        onChange={(e) => {
                          const updated = [...form.rows]
                          updated[i] = { ...row, uri: e.target.value }
                          set('rows', updated)
                        }}
                        placeholder="https://github.com/sponsors/you"
                        disabled={saving}
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() => set('rows', form.rows.filter((_, j) => j !== i))}
                        disabled={saving}
                        className="shrink-0 text-slate-400 hover:text-red-500 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {/* Row 2: suggested amount (optional plan details) */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500">Suggested:</span>
                      <input
                        value={row.amount}
                        onChange={(e) => {
                          const updated = [...form.rows]
                          updated[i] = { ...row, amount: e.target.value }
                          set('rows', updated)
                        }}
                        placeholder="—"
                        disabled={saving}
                        className="w-20 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <input
                        value={row.currency}
                        onChange={(e) => {
                          const updated = [...form.rows]
                          updated[i] = { ...row, currency: e.target.value.toUpperCase() }
                          set('rows', updated)
                        }}
                        placeholder="USD"
                        maxLength={3}
                        disabled={saving}
                        className="w-16 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                      <select
                        value={row.frequency}
                        onChange={(e) => {
                          const updated = [...form.rows]
                          updated[i] = { ...row, frequency: e.target.value }
                          set('rows', updated)
                        }}
                        disabled={saving}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                        <option value="one-time">One-time</option>
                        <option value="weekly">Weekly</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                )
              })}

              <button
                type="button"
                onClick={() => {
                  const seq = form.nextSeq
                  setForm((prev) => ({
                    ...prev,
                    rows: [...prev.rows, { id: nextId(), seq, uri: '', label: '', name: '', amount: '', currency: 'USD', frequency: 'monthly' }],
                    nextSeq: seq + 1,
                  }))
                  setSaved(false)
                }}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-medium text-[var(--support)] hover:opacity-80 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Add channel
              </button>
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
