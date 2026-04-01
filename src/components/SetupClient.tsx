'use client'

import { useState, useMemo, useId } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  CheckCircle2,
  Heart,
  HeartHandshake,
  LogOut,
  Plus,
  Trash2,
} from 'lucide-react'
import { StewardCard } from '@/components/ProjectCards'
import type { StewardEntry } from '@/lib/steward-model'
import type { FundAtResult } from '@/lib/fund-at-records'
import { validateUrl } from '@/lib/validate'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DependencyRow = { id: string; uri: string; label: string }

type FormState = {
  contributeUrl: string
  dependencies: DependencyRow[]
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
  const dependencies: DependencyRow[] =
    existing?.dependencies?.map((d) => ({
      id: nextId(),
      uri: d.uri,
      label: d.label ?? '',
    })) ?? []

  return {
    contributeUrl: existing?.contributeUrl ?? '',
    dependencies,
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

  // Dependency rows
  function addDependency() {
    set('dependencies', [...form.dependencies, { id: nextId(), uri: '', label: '' }])
  }

  function updateDependency(id: string, field: 'uri' | 'label', value: string) {
    set(
      'dependencies',
      form.dependencies.map((d) => (d.id === id ? { ...d, [field]: value } : d)),
    )
  }

  function removeDependency(id: string) {
    set('dependencies', form.dependencies.filter((d) => d.id !== id))
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const contributeUrlError = useMemo(
    () => check(form.contributeUrl, validateUrl),
    [form.contributeUrl],
  )

  const hasErrors =
    !!contributeUrlError ||
    (!form.contributeUrl.trim() && form.dependencies.filter((d) => d.uri.trim()).length === 0)

  // Live preview model
  const previewModel: StewardEntry = useMemo(
    () => ({
      uri: did,
      did: did,
      tags: ['tool'] as const,
      displayName: handle ?? did,
      contributeUrl: contributeUrlError ? undefined : form.contributeUrl.trim() || undefined,
      dependencies: form.dependencies
        .filter((d) => d.uri.trim())
        .map((d) => d.uri.trim()),
      source: 'fund.at',
    }),
    [form, did, handle, contributeUrlError],
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (hasErrors) return

    setSaving(true)
    setErr(null)
    setSaved(false)

    try {
      const res = await fetch('/api/setup', {
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

        {/* Preview -- sticky at top while scrolling */}
        <section className="sticky top-0 z-10 -mx-4 border-b border-slate-200/80 bg-[var(--background)]/95 px-4 pb-4 pt-2 backdrop-blur dark:border-slate-800">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Example -- how you appear to supporters
          </p>
          <div className="pointer-events-none select-none">
            <StewardCard entry={previewModel} />
          </div>
        </section>

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

              {form.dependencies.length > 0 && (
                <ul className="flex flex-col gap-3">
                  {form.dependencies.map((dep, i) => (
                    <li key={dep.id}>
                      <div className="flex items-start gap-2">
                        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            value={dep.uri}
                            onChange={(e) => updateDependency(dep.id, 'uri', e.target.value)}
                            placeholder="example.com or did:plc:..."
                            aria-label={`Dependency ${i + 1} URI`}
                            disabled={saving}
                            className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)]/30 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                          />
                          <input
                            type="text"
                            value={dep.label}
                            onChange={(e) => updateDependency(dep.id, 'label', e.target.value)}
                            placeholder="Label (optional)"
                            aria-label={`Dependency ${i + 1} label`}
                            disabled={saving}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-[var(--support)] focus:outline-none focus:ring-1 focus:ring-[var(--support)]/30 disabled:opacity-50 sm:w-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDependency(dep.id)}
                          disabled={saving}
                          aria-label="Remove dependency"
                          className="mt-2 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-500 disabled:opacity-50 dark:hover:bg-slate-800"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                onClick={addDependency}
                disabled={saving}
                className="inline-flex items-center gap-2 self-start rounded-lg border border-dashed border-[var(--support-border)] px-4 py-2 text-sm font-medium text-[var(--support)] transition-colors hover:bg-[var(--support-muted)] disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add a dependency
              </button>
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
                  <Heart className="h-4 w-4" aria-hidden />
                  {saving ? 'Publishing...' : saved ? 'Publish again' : 'Publish records'}
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
      </div>
    </div>
  )
}
