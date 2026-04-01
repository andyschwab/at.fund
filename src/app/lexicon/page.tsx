import Link from 'next/link'
import type { Metadata } from 'next'
import contributeSchema from '../../../lexicon/fund.at.contribute.json'
import dependencySchema from '../../../lexicon/fund.at.dependency.json'
import watchSchema from '../../../lexicon/fund.at.watch.json'

export const metadata: Metadata = {
  title: 'Lexicon — at.fund',
  description:
    'The fund.at.* ATProto lexicons: contribute, dependency, and watch.',
}

// ---- Schema shape types ----

type LexProp = {
  type?: string
  format?: string
  description?: string
  ref?: string
  items?: { type?: string; ref?: string }
  minItems?: number
  maxLength?: number
}

type LexDef = {
  type?: string
  description?: string
  required?: string[]
  properties?: Record<string, LexProp>
  key?: string
  record?: {
    type: string
    required?: string[]
    properties: Record<string, LexProp>
  }
}

type LexSchema = {
  lexicon: number
  id: string
  description?: string
  defs: Record<string, LexDef>
}

// ---- Helpers ----

function typeLabel(prop: LexProp): string {
  if (prop.type === 'array') {
    if (prop.items?.ref) return prop.items.ref.replace('#', '') + '[]'
    return (prop.items?.type ?? 'any') + '[]'
  }
  if (prop.type === 'ref') return prop.ref?.replace('#', '') ?? 'ref'
  if (prop.format) return prop.format
  return prop.type ?? ''
}

// ---- Field row ----

function Field({
  name,
  prop,
  isRequired = false,
}: {
  name: string
  prop: LexProp
  isRequired?: boolean
}) {
  const label = typeLabel(prop)
  return (
    <div className="flex gap-x-4 py-2.5">
      <div className="shrink-0 w-40">
        <div
          className={`font-mono text-sm leading-snug ${
            isRequired ? 'text-support' : 'text-slate-700 dark:text-slate-300'
          }`}
        >
          {name}
        </div>
        {label && (
          <div className="font-mono text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            {label}
          </div>
        )}
      </div>
      <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed flex-1 min-w-0">
        {prop.description}
      </div>
    </div>
  )
}

// ---- Expanded ref: object def rendered as a sub-section ----

function ExpandedDef({
  name,
  desc,
  def,
  defs,
  isRequired = false,
}: {
  name: string
  desc?: string
  def: LexDef
  defs: Record<string, LexDef>
  isRequired?: boolean
}) {
  return (
    <div className="py-2.5">
      <div className="flex gap-x-4">
        <div className="shrink-0 w-40">
          <div
            className={`font-mono text-sm leading-snug ${
              isRequired ? 'text-support' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {name}
          </div>
          <div className="font-mono text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            object
          </div>
        </div>
        {desc && (
          <div className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed flex-1">
            {desc}
          </div>
        )}
      </div>
      {def.properties && Object.keys(def.properties).length > 0 && (
        <div className="mt-1 ml-4 pl-4 border-l-2 border-slate-200 dark:border-slate-700/50">
          <PropList
            properties={def.properties}
            required={def.required}
            defs={defs}
          />
        </div>
      )}
    </div>
  )
}

// ---- Prop list — renders all fields in a def, divide-y between siblings ----

function PropList({
  properties,
  required,
  defs,
}: {
  properties: Record<string, LexProp>
  required?: string[]
  defs: Record<string, LexDef>
}) {
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
      {Object.entries(properties).map(([name, prop]) => {
        const isRequired = required?.includes(name) ?? false

        // Direct ref → expand the referenced def inline
        if (prop.type === 'ref') {
          const refKey = prop.ref?.replace('#', '')
          const refDef = refKey ? defs[refKey] : undefined
          if (refDef) {
            return (
              <ExpandedDef
                key={name}
                name={name}
                desc={prop.description ?? refDef.description}
                def={refDef}
                defs={defs}
                isRequired={isRequired}
              />
            )
          }
        }

        // Array of refs → show the field row, then expand the item shape below it
        if (prop.type === 'array' && prop.items?.ref) {
          const refKey = prop.items.ref.replace('#', '')
          const refDef = defs[refKey]
          if (refDef?.properties) {
            return (
              <div key={name}>
                <Field name={name} prop={prop} isRequired={isRequired} />
                <div className="ml-4 pl-4 border-l-2 border-slate-200 dark:border-slate-700/50 mb-1">
                  <PropList
                    properties={refDef.properties}
                    required={refDef.required}
                    defs={defs}
                  />
                </div>
              </div>
            )
          }
        }

        return <Field key={name} name={name} prop={prop} isRequired={isRequired} />
      })}
    </div>
  )
}

// ---- One record section ----

function RecordSection({
  schema,
  keyType,
  summary,
}: {
  schema: LexSchema
  keyType: string
  summary: string
}) {
  const main = schema.defs.main
  const properties = main.record?.properties ?? main.properties ?? {}
  const requiredFields = main.record?.required ?? main.required
  const defs = schema.defs

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
        <h3 className="font-mono text-base font-semibold">{schema.id}</h3>
        <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
          key: {keyType}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        {summary}
      </p>
      <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/20 px-5">
        <PropList
          properties={properties as Record<string, LexProp>}
          required={requiredFields}
          defs={defs as Record<string, LexDef>}
        />
      </div>
    </section>
  )
}

// ---- Page ----

export default function LexiconPage() {
  return (
    <div className="page-wash min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-12">

        <Link href="/" className="text-sm text-sky-700 underline dark:text-sky-400">
          ← Back
        </Link>

        {/* Hero */}
        <div className="mt-10">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
            fund.at.*
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Lexicon</h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            <code className="font-mono text-sm">fund.at.*</code> is a small family of
            ATProto lexicons. They let a project steward publish funding metadata —
            how to support them, what they depend on, and what they watch — directly from their
            ATProto repo. Any client that speaks ATProto can discover and render these records
            without a central registry.
          </p>
        </div>

        {/* Quick start for maintainers */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">Get found on AT.fund</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            If your domain already has an <code className="font-mono text-xs">_atproto</code> TXT
            record — for handle verification, or because you run an ATProto service — AT.fund can
            already resolve your DID. Add your <code className="font-mono text-xs">fund.at.*</code>{' '}
            records and you&apos;re done.
          </p>

          <div className="mt-5 overflow-x-auto rounded-xl border border-support-border bg-support-muted">
            <div className="px-5 pt-4 pb-1">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3">
                DNS TXT record
              </p>
              <pre className="font-mono text-sm leading-relaxed"><span className="text-slate-400 dark:text-slate-500">_atproto.</span><span className="font-semibold text-foreground">yourdomain.com</span>
<span className="text-slate-500 dark:text-slate-400 text-xs mt-1 block">→</span><span className="text-slate-700 dark:text-slate-200">did=did:plc:xxxxxxxxxxxxxxxxxxxx</span></pre>
            </div>
            <div className="border-t border-support-border px-5 py-3 mt-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No DNS record? There&apos;s an HTTPS fallback at{' '}
                <code className="font-mono">/.well-known/atproto-did</code> too.
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            Once AT.fund resolves your DID, it finds your PDS and fetches your{' '}
            <code className="font-mono text-xs">fund.at.*</code> records. The setup page
            handles the ATProto details so you don&apos;t have to.
          </p>
        </section>

        {/* Discovery flow */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">How discovery works</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            AT.fund starts from the domains and NSIDs it finds in your ATProto repo and
            resolves them to stewards. Discovery follows the same DNS handle-resolution that
            ATProto already uses for identity — no new infrastructure required.
          </p>

          <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/30 overflow-x-auto">
            <div className="px-5 py-4 font-mono text-sm space-y-1">
              <div>
                <span className="text-slate-400 dark:text-slate-500">hostname   </span>
                <span className="text-foreground">example.com</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500">→ DNS      </span>
                <span className="text-slate-600 dark:text-slate-300">_atproto.example.com TXT</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500">→ or HTTPS </span>
                <span className="text-slate-600 dark:text-slate-300">example.com/.well-known/atproto-did</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500">→ DID      </span>
                <span className="text-slate-600 dark:text-slate-300">did:plc:xxxxxxxxxxxxxxxxxxxx</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500">→ PDS      </span>
                <span className="text-slate-600 dark:text-slate-300">their.pds.host → getRecord / listRecords</span>
              </div>
              <div>
                <span className="text-slate-400 dark:text-slate-500">→ records  </span>
                <span className="text-support">fund.at.contribute</span>
                <span className="text-slate-500 dark:text-slate-400">, </span>
                <span className="text-slate-600 dark:text-slate-300">fund.at.dependency</span>
                <span className="text-slate-500 dark:text-slate-400">, </span>
                <span className="text-slate-600 dark:text-slate-300">fund.at.watch</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            When a steward hasn&apos;t yet published{' '}
            <code className="font-mono text-xs">fund.at.*</code> records, AT.fund falls back
            to a manually curated catalog so well-known projects still appear.
          </p>
        </section>

        {/* Record schemas — auto-rendered from the JSON schema files */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">Record schemas</h2>

          <RecordSection
            schema={contributeSchema as unknown as LexSchema}
            keyType="literal:self"
            summary="Your funding page URL — GitHub Sponsors, Open Collective, Patreon, or any page where people can support you. One record per repo, read with getRecord."
          />
          <RecordSection
            schema={dependencySchema as unknown as LexSchema}
            keyType="tid"
            summary="One record per dependency: a DID or hostname for each project your tool builds on. This lets AT.fund surface the full dependency tree so the infrastructure underneath you gets credit too."
          />
          <RecordSection
            schema={watchSchema as unknown as LexSchema}
            keyType="tid"
            summary="A watchlist entry: track the funding status of an entity you care about, even if you don't depend on it directly."
          />
        </section>

        {/* CTA */}
        <section className="mt-14">
          <div className="rounded-2xl border border-support-border bg-support-muted px-6 py-8 text-center">
            <h2 className="text-lg font-semibold">Ready?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              The setup page creates your records for you — step by step, no ATProto
              expertise required.
            </p>
            <Link
              href="/setup"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-support px-5 py-2.5 text-sm font-semibold text-support-foreground hover:opacity-90 transition-opacity"
            >
              Set up your records →
            </Link>
          </div>
        </section>

        {/* Record keys footnote */}
        <section className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-8">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Record keys
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            <code className="font-mono text-xs">fund.at.contribute</code> uses a{' '}
            <code className="font-mono text-xs">literal:self</code> key — one record per repo.{' '}
            <code className="font-mono text-xs">fund.at.dependency</code> and{' '}
            <code className="font-mono text-xs">fund.at.watch</code> use{' '}
            <code className="font-mono text-xs">tid</code> keys so you can create multiple
            records per repo.
          </p>
        </section>

        {/* Status note */}
        <div className="mt-8 pb-16 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            These schemas are a work in progress. This page always reflects the current
            definitions in <code className="font-mono">lexicon/</code>.
          </p>
        </div>

      </div>
    </div>
  )
}
