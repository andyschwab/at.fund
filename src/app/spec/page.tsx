import Link from 'next/link'
import type { Metadata } from 'next'
import declarationSchema from '../../../lexicon/fund.at.actor.declaration.json'
import contributeSchema from '../../../lexicon/fund.at.funding.contribute.json'
import channelSchema from '../../../lexicon/fund.at.funding.channel.json'
import planSchema from '../../../lexicon/fund.at.funding.plan.json'
import dependencySchema from '../../../lexicon/fund.at.graph.dependency.json'
import endorseSchema from '../../../lexicon/fund.at.graph.endorse.json'

export const metadata: Metadata = {
  title: 'Spec — at.fund',
  description:
    'Why at.fund exists, how it works, and the fund.at.* lexicon reference.',
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

// ---- Prop list ----

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

// ---- Spec field table ----

function SpecTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white/60 dark:bg-slate-800/20 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                className="text-left font-medium text-slate-700 dark:text-slate-300 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700/60"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={
                i < rows.length - 1
                  ? 'border-b border-slate-100 dark:border-slate-800/60'
                  : ''
              }
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-4 py-2.5 text-slate-600 dark:text-slate-400 align-top"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- Page ----

export default function SpecPage() {
  return (
    <div className="page-wash min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-12">

        <Link href="/" className="text-sm text-sky-700 underline dark:text-sky-400">
          &larr; Back
        </Link>

        {/* ── Section 1: Hero / Vision ──────────────────────────── */}
        <div className="mt-10">
          <p className="font-mono text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
            fund.at.*
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Specification</h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            at.fund is a funding signal layer for the AT Protocol. It publishes
            metadata &mdash; it never intermediates payments, never holds funds,
            never takes a cut. Records are DID-signed and live in each
            steward&apos;s own repository, not on a platform. What sets it apart
            from every prior funding standard: social context. When people in
            your network endorse a project, that signal is cryptographically
            verifiable and independently auditable. No static file can do that.
          </p>
          <p className="mt-3 font-mono text-xs text-slate-400 dark:text-slate-500">
            v0.1.0 (draft) &mdash; April 2026
          </p>
        </div>

        {/* ── Section 2: Prior Art & Lineage ────────────────────── */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">Prior Art and Lineage</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            at.fund does not exist in isolation. It inherits from a decades-long
            lineage of web-native funding signals, each building on the last.
          </p>

          <SpecTable
            headers={['Year', 'Standard', 'What it introduced']}
            rows={[
              ['2002', 'rel="payment"', 'The foundational link relation: "here is where you can pay the author."'],
              ['2019', 'GitHub FUNDING.yml', 'Platform-specific structured funding for repositories.'],
              ['2019', 'npm funding', 'Package-level funding metadata. First to connect funding to the dependency graph.'],
              ['2020', 'podcast:funding', 'RSS namespace extension. Brought url + label semantics to syndicated media.'],
              ['2024', 'funding.json', 'Comprehensive machine-readable standard. Entity metadata, typed channels, tiered plans.'],
              ['2025', 'at.fund', 'ATProto-native. Combines structured metadata with cryptographic identity and social graph.'],
            ]}
          />

          <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/30 px-5 py-4 font-mono text-sm leading-relaxed overflow-x-auto">
            <div className="space-y-1">
              <div><span className="text-slate-400 dark:text-slate-500">{'rel="payment"      '}</span> <span className="text-slate-500 dark:text-slate-400">&rarr;  &quot;Support this content&quot; (the primitive signal)</span></div>
              <div><span className="text-slate-400 dark:text-slate-500">{'GitHub FUNDING.yml '}</span> <span className="text-slate-500 dark:text-slate-400">&rarr;  &quot;Support this project, via these platforms&quot;</span></div>
              <div><span className="text-slate-400 dark:text-slate-500">{'npm funding         '}</span> <span className="text-slate-500 dark:text-slate-400">&rarr;  &quot;Support this dependency&quot; (graph-aware)</span></div>
              <div><span className="text-slate-400 dark:text-slate-500">{'podcast:funding    '}</span> <span className="text-slate-500 dark:text-slate-400">&rarr;  &quot;Support this feed&quot; (syndicated, labeled)</span></div>
              <div><span className="text-slate-400 dark:text-slate-500">{'funding.json       '}</span> <span className="text-slate-500 dark:text-slate-400">&rarr;  &quot;Support this entity&quot; (structured, multi-channel)</span></div>
              <div><span className="text-support font-medium">{'at.fund              '}</span> <span className="text-slate-500 dark:text-slate-400">&rarr;  &quot;Support this entity&quot; (signed, social, graph-aware)</span></div>
            </div>
          </div>

          <h3 className="mt-8 text-sm font-semibold text-slate-800 dark:text-slate-200">
            What at.fund adds
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">Cryptographic provenance</span> &mdash; records are DID-signed, not just DNS-verified</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">Social context</span> &mdash; endorsements from your network surface relevance</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">Dependency awareness</span> &mdash; transitive dependency scanning, not just direct</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">Protocol-native</span> &mdash; records live in the user&apos;s ATProto repository, not a separate file or platform</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">Cross-account references</span> &mdash; plans can point to channels in any account, enabling shared payment infrastructure</span>
            </li>
          </ul>
        </section>

        {/* ── Section 3: Architecture — Three Layers ────────────── */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">Architecture: Three Layers</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            at.fund operates as a three-layer system. Each layer is independent
            and optional; higher layers provide progressive enhancement.
          </p>

          <div className="mt-4 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/30 px-5 py-4 font-mono text-sm leading-relaxed">
            <div className="space-y-1">
              <div><span className="text-slate-500 dark:text-slate-400">Layer 1: Contribute</span>{'      '}<span className="text-slate-400 dark:text-slate-500">&rarr;</span>  <span className="text-slate-600 dark:text-slate-300">&quot;Here is my funding page&quot;</span></div>
              <div><span className="text-slate-500 dark:text-slate-400">Layer 2: Channels + Plans</span>{' '}<span className="text-slate-400 dark:text-slate-500">&rarr;</span>  <span className="text-slate-600 dark:text-slate-300">&quot;Here are my payment endpoints and tiers&quot;</span></div>
              <div><span className="text-slate-500 dark:text-slate-400">Layer 3: Social Graph</span>{'     '}<span className="text-slate-400 dark:text-slate-500">&rarr;</span>  <span className="text-slate-600 dark:text-slate-300">&quot;Here is who endorses and depends on me&quot;</span></div>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Any combination is valid: just a contribute link, channels without
            plans, social graph without funding data, or the full stack.
          </p>

          {/* Layer 1 */}
          <h3 className="mt-8 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Layer 1: Contribute
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            The simplest possible funding signal &mdash; a single URL pointing to
            where contributions can be made. The ATProto equivalent of{' '}
            <code className="font-mono text-xs">{'<link rel="payment">'}</code>.
            Singleton per account (<code className="font-mono text-xs">key: literal:self</code>).
          </p>
          <SpecTable
            headers={['Field', 'Type', 'Required']}
            rows={[
              ['url', 'uri', 'Yes'],
              ['label', 'string (\u2264128)', 'No'],
              ['createdAt', 'datetime', 'No'],
            ]}
          />

          {/* Layer 2 */}
          <h3 className="mt-8 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Layer 2: Channels and Plans
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Structured payment metadata. Each channel and plan is its own record,
            individually addressable by AT URI. This enables fine-grained updates,
            cross-account references (a plan in one account can point to a channel
            in another), and natural protocol-level operations.
          </p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Channel
          </p>
          <SpecTable
            headers={['Field', 'Type', 'Required']}
            rows={[
              ['channelType', 'string (\u226432)', 'Yes'],
              ['uri', 'uri', 'No'],
              ['description', 'string (\u2264500)', 'No'],
              ['createdAt', 'datetime', 'No'],
            ]}
          />
          <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Plan
          </p>
          <SpecTable
            headers={['Field', 'Type', 'Required']}
            rows={[
              ['status', 'string (\u226416)', 'No'],
              ['name', 'string (\u2264128)', 'Yes'],
              ['description', 'string (\u2264500)', 'No'],
              ['amount', 'integer (smallest unit)', 'No'],
              ['currency', 'string (\u22643)', 'No'],
              ['frequency', 'string (\u226416)', 'No'],
              ['channels', 'at-uri[]', 'No'],
              ['createdAt', 'datetime', 'No'],
            ]}
          />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Amounts are stored in the smallest currency unit (cents for USD, pence
            for GBP) to avoid floating-point ambiguity.
          </p>

          {/* Layer 3 */}
          <h3 className="mt-8 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Layer 3: Social Graph
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            These records have no equivalent in prior art. They create a social
            funding graph on top of the ATProto social graph:{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">endorsements</span> (&quot;I
            vouch for this entity&apos;s work&quot;) and{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">dependencies</span> (&quot;my
            work depends on this entity&quot;). Endorsement counts are verifiable
            because they live on each endorser&apos;s PDS, not the endorsed
            project&apos;s.
          </p>

          {/* Identity Layer */}
          <h3 className="mt-8 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Identity Layer
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            A participation signal &mdash; its existence means &quot;this account
            is part of the at.fund ecosystem.&quot; All fields are optional enrichment.
            Singleton per account (<code className="font-mono text-xs">key: literal:self</code>).
          </p>
          <SpecTable
            headers={['Field', 'Type', 'Required']}
            rows={[
              ['entityType', 'string (\u226432)', 'No'],
              ['role', 'string (\u226432)', 'No'],
              ['createdAt', 'datetime', 'No'],
            ]}
          />

          {/* Namespace Organization */}
          <h3 className="mt-8 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Namespace Organization
          </h3>
          <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/30 px-5 py-4 font-mono text-sm leading-relaxed">
            <div className="space-y-3">
              <div>
                <div className="text-slate-700 dark:text-slate-300 font-medium">fund.at.actor.*</div>
                <div className="text-slate-500 dark:text-slate-400 ml-2">.declaration &mdash; &quot;I exist in the at.fund ecosystem&quot;</div>
              </div>
              <div>
                <div className="text-slate-700 dark:text-slate-300 font-medium">fund.at.funding.*</div>
                <div className="text-slate-500 dark:text-slate-400 ml-2">.contribute &mdash; &quot;Here is my funding page&quot;</div>
                <div className="text-slate-500 dark:text-slate-400 ml-2">.channel &mdash; &quot;Here is a payment endpoint&quot;</div>
                <div className="text-slate-500 dark:text-slate-400 ml-2">.plan &mdash; &quot;Here is a funding tier&quot;</div>
              </div>
              <div>
                <div className="text-slate-700 dark:text-slate-300 font-medium">fund.at.graph.*</div>
                <div className="text-slate-500 dark:text-slate-400 ml-2">.endorse &mdash; &quot;I endorse this entity&quot;</div>
                <div className="text-slate-500 dark:text-slate-400 ml-2">.dependency &mdash; &quot;I depend on this entity&quot;</div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 4: Design Principles ──────────────────────── */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">Design Principles</h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-sm font-semibold text-slate-800 dark:text-slate-200">Signal, not platform</dt>
              <dd className="mt-1 text-sm text-slate-600 dark:text-slate-400">at.fund publishes metadata. It never intermediates payments, never holds funds, never takes a commission.</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-800 dark:text-slate-200">Progressive enhancement</dt>
              <dd className="mt-1 text-sm text-slate-600 dark:text-slate-400">Each layer is optional. A steward with just a declaration gets discovered. Add a contribute URL and you get a card with a button. Add channels and plans for richer cards.</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-800 dark:text-slate-200">Individual records, not monoliths</dt>
              <dd className="mt-1 text-sm text-slate-600 dark:text-slate-400">Each channel and plan is its own record, individually addressable by AT URI. Fine-grained updates, cross-account references, natural protocol operations.</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-800 dark:text-slate-200">Steward sovereignty</dt>
              <dd className="mt-1 text-sm text-slate-600 dark:text-slate-400">The steward&apos;s PDS repository is the source of truth. Records are DID-signed, giving cryptographic proof of authorship that DNS-based systems cannot provide.</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-800 dark:text-slate-200">Lenient reader, strict writer</dt>
              <dd className="mt-1 text-sm text-slate-600 dark:text-slate-400">at.fund reads funding data leniently &mdash; if a field parses, we use it. But the setup flow writes records strictly, producing well-formed data other consumers can rely on.</dd>
            </div>
            <div>
              <dt className="text-sm font-semibold text-slate-800 dark:text-slate-200">Social context is the differentiator</dt>
              <dd className="mt-1 text-sm text-slate-600 dark:text-slate-400">&quot;12 people you follow endorse this project&quot; is information no static file can provide.</dd>
            </div>
          </dl>
        </section>

        {/* ── Section 5: Lexicon Reference ──────────────────────── */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">Lexicon Reference</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Six AT Protocol record types organized into three namespaces &mdash;{' '}
            <code className="font-mono text-xs">fund.at.actor</code> (identity),{' '}
            <code className="font-mono text-xs">fund.at.funding</code> (payment), and{' '}
            <code className="font-mono text-xs">fund.at.graph</code> (relationships). Any client
            can read them directly from a user&apos;s repo.
          </p>

          {/* fund.at.actor */}
          <div className="mt-6">
            <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              fund.at.actor
            </h3>
          </div>
          <RecordSection
            schema={declarationSchema as unknown as LexSchema}
            keyType="literal:self"
            summary="Signals participation in the fund.at ecosystem. Create to join, delete to leave. A backfill service can enumerate all participants by scanning for this record. Optional fields describe the entity type and role."
          />

          {/* fund.at.funding */}
          <div className="mt-10">
            <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              fund.at.funding
            </h3>
          </div>
          <RecordSection
            schema={contributeSchema as unknown as LexSchema}
            keyType="literal:self"
            summary="Your funding page — GitHub Sponsors, Open Collective, Patreon, or any URL where people can support you. One record per account."
          />
          <RecordSection
            schema={channelSchema as unknown as LexSchema}
            keyType="any (channel slug)"
            summary="A payment channel — a specific place where contributions can be received. Each channel is its own record keyed by a slug ID (e.g. &apos;github-sponsors&apos;). Individually addressable by AT URI, enabling cross-account references."
          />
          <RecordSection
            schema={planSchema as unknown as LexSchema}
            keyType="any (plan slug)"
            summary="A funding plan or tier with a suggested amount. References channels by AT URI, which may be in this account or any other account. This enables teams to share a common payment channel while each maintainer publishes their own plans."
          />

          {/* fund.at.graph */}
          <div className="mt-10">
            <h3 className="font-mono text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              fund.at.graph
            </h3>
          </div>
          <RecordSection
            schema={dependencySchema as unknown as LexSchema}
            keyType="any (subject)"
            summary="One record per upstream project you depend on. The subject field is a DID or hostname. Surfaces the full dependency tree so the infrastructure underneath you gets credit too."
          />
          <RecordSection
            schema={endorseSchema as unknown as LexSchema}
            keyType="any (rkey = endorsed subject)"
            summary="A public endorsement of any entity you use or value. The record key is the endorsed subject (a DID or hostname), so each entity can only be endorsed once per account. Unlike contribute and dependency (published by builders), endorse is published by users — a protocol-native signal of trust. Counts are verifiable because endorsements live on each endorser&apos;s PDS, not the endorsed project&apos;s."
          />
        </section>

        {/* ── Section 6: funding.json Compatibility ─────────────── */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">funding.json Compatibility</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            at.fund aims for round-trip fidelity with funding.json v1.x. A
            steward&apos;s funding.json can be converted to at.fund records and back
            without information loss.
          </p>

          <SpecTable
            headers={['funding.json field', 'at.fund record', 'Notes']}
            rows={[
              ['entity.type', 'fund.at.actor.declaration.entityType', 'Direct mapping'],
              ['entity.role', 'fund.at.actor.declaration.role', 'Direct mapping'],
              ['funding.channels[]', 'fund.at.funding.channel records', 'One record per channel; guid \u2192 rkey, type \u2192 channelType, address \u2192 uri'],
              ['funding.plans[]', 'fund.at.funding.plan records', 'One record per plan; guid \u2192 rkey, amount \u00d7 100, channels as AT URIs'],
            ]}
          />

          <h3 className="mt-8 text-sm font-semibold text-slate-800 dark:text-slate-200">
            Intentionally omitted
          </h3>
          <SpecTable
            headers={['funding.json field', 'Why omitted']}
            rows={[
              ['entity.name', 'Available from the ATProto profile'],
              ['entity.email', 'Privacy concern; not appropriate for a public record'],
              ['entity.phone', 'Privacy concern'],
              ['entity.description', 'Available from the ATProto profile'],
              ['entity.webpageUrl', 'Derivable from the DID document'],
              ['projects[]', 'Out of scope \u2014 at.fund is per-account, not per-project'],
            ]}
          />

          <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            All string fields with constrained vocabularies use ATProto&apos;s{' '}
            <code className="font-mono text-xs">knownValues</code> pattern rather
            than closed enums. New values can be added without breaking existing
            clients.
          </p>
        </section>

        {/* ── Section 7: Acknowledgements ───────────────────────── */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">Acknowledgements</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            This specification builds on the work of:
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">Eric Meyer and Tantek &#199;elik</span> &mdash; <code className="font-mono text-xs">rel=&quot;payment&quot;</code> (2002), the foundational web funding signal</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">GitHub</span> &mdash; FUNDING.yml (2019), platform-aware funding metadata</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">npm</span> &mdash; funding field (2019), dependency-graph-aware funding</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">Podcasting 2.0 / Adam Curry and Dave Jones</span> &mdash; <code className="font-mono text-xs">podcast:funding</code> (2020), syndicated funding signals</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">FLOSS/fund and the funding.json community</span> &mdash; funding.json (2024), the most comprehensive machine-readable funding standard</span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
              <span><span className="font-medium text-slate-700 dark:text-slate-300">The ATProto team at Bluesky</span> &mdash; the protocol that makes decentralized, cryptographically-signed records possible</span>
            </li>
          </ul>
        </section>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-8 pb-16 space-y-3 text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
          <p>
            This specification is a work in progress. It always reflects the
            current definitions in{' '}
            <a
              href="https://github.com/andyschwab/at.fund"
              className="underline hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              github.com/andyschwab/at.fund
            </a>
            .
          </p>
          <p>
            Integration guides and code examples are coming to a dedicated page.
          </p>
        </div>

      </div>
    </div>
  )
}
