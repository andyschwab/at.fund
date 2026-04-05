import Link from 'next/link'
import type { Metadata } from 'next'
import contributeSchema from '../../../lexicon/fund.at.contribute.json'
import manifestSchema from '../../../lexicon/fund.at.manifest.json'
import dependencySchema from '../../../lexicon/fund.at.dependency.json'
import endorseSchema from '../../../lexicon/fund.at.endorse.json'

export const metadata: Metadata = {
  title: 'Lexicon — at.fund',
  description:
    'The fund.at.* AT Protocol lexicons: contribute, dependency, and endorse.',
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
            Four AT Protocol record types that publish funding metadata to your PDS — where to
            support you, how to pay you, what you depend on, and who you endorse. Any client can
            read them directly from your repo. No central registry, no middleman.
          </p>
        </div>

        {/* Records — lead section */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">The records</h2>

          <RecordSection
            schema={contributeSchema as unknown as LexSchema}
            keyType="literal:self"
            summary="Your funding page — GitHub Sponsors, Open Collective, Patreon, or any URL where people can support you. One record per account."
          />
          <RecordSection
            schema={manifestSchema as unknown as LexSchema}
            keyType="literal:self"
            summary="Machine-readable funding manifest — payment channels and optional plans with amounts. The ATProto-native equivalent of funding.json (fundingjson.org), with DID-signed provenance. Published alongside your contribute URL for richer funding cards."
          />
          <RecordSection
            schema={dependencySchema as unknown as LexSchema}
            keyType="any (uri)"
            summary="One record per upstream project you depend on. Surfaces the full dependency tree so the infrastructure underneath you gets credit too."
          />
          <RecordSection
            schema={endorseSchema as unknown as LexSchema}
            keyType="any (rkey = endorsed URI)"
            summary="A public endorsement of any entity you use or value. The record key is the endorsed URI (a DID or hostname), so each entity can only be endorsed once per account. Unlike contribute and dependency (published by builders), endorse is published by users — a protocol-native signal of trust. Counts are verifiable because endorsements live on each endorser's PDS, not the endorsed project's."
          />
        </section>

        {/* Resolution */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">Resolution</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Every AT Protocol entity — feed generator, labeler, PDS, relay, appview, personal
            account — has a DID. <code className="font-mono text-xs">fund.at.*</code> records live
            in that entity&apos;s PDS repo, so any builder can discover funding relationships
            through the same record queries they already use.
          </p>

          <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/30 overflow-x-auto">
            <div className="px-5 py-4 font-mono text-sm space-y-1.5">
              <div className="flex gap-x-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">feed AT URI  </span>
                <span className="text-slate-600 dark:text-slate-300">at://did:plc:…/app.bsky.feed.generator/…</span>
              </div>
              <div className="flex gap-x-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">             </span>
                <span className="text-slate-500 dark:text-slate-400">→ creator DID embedded in URI</span>
              </div>
              <div className="mt-2 flex gap-x-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">labeler      </span>
                <span className="text-slate-600 dark:text-slate-300">did:plc:…</span>
              </div>
              <div className="flex gap-x-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">             </span>
                <span className="text-slate-500 dark:text-slate-400">→ DID is the identity directly</span>
              </div>
              <div className="mt-2 flex gap-x-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">hostname     </span>
                <span className="text-slate-600 dark:text-slate-300">example.com</span>
              </div>
              <div className="flex gap-x-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">             </span>
                <span className="text-slate-500 dark:text-slate-400">→ AT Protocol handle resolution (_atproto DNS / .well-known)</span>
              </div>
              <div className="mt-3 border-t border-slate-200 dark:border-slate-700/60 pt-3 flex gap-x-2">
                <span className="text-slate-400 dark:text-slate-500 shrink-0">all paths    </span>
                <span className="text-slate-500 dark:text-slate-400">→ DID → PDS →{' '}
                  <span className="text-support">fund.at.contribute</span>
                  <span className="text-slate-400 dark:text-slate-500">, </span>
                  fund.at.manifest
                  <span className="text-slate-400 dark:text-slate-500">, </span>
                  fund.at.dependency
                  <span className="text-slate-400 dark:text-slate-500">, </span>
                  fund.at.endorse
                </span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            If you run a feed, labeler, or any AT Protocol service, you already have a
            DID — publish <code className="font-mono text-xs">fund.at.*</code> records and anyone
            can find them. If you build something that surfaces AT Protocol content, you can attach
            funding context to any creator or service whose DID you know.
          </p>
        </section>

        {/* Integration guide */}
        <section className="mt-14">
          <h2 className="text-lg font-semibold">Integrate fund.at into your app</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            The fund.at lexicon is open. Any AT Protocol client can read these records directly — no
            dependency on this site. Here&apos;s how to get started.
          </p>

          {/* Read a funding link */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Read a funding link
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Fetch the <code className="font-mono text-xs">fund.at.contribute</code> record from
              any DID&apos;s PDS to find their funding page.
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/30 p-4 font-mono text-xs leading-relaxed overflow-x-auto">
              <div className="text-slate-500 dark:text-slate-400">{'// Resolve DID → PDS, then fetch the record'}</div>
              <div><span className="text-slate-500">const</span> pds = <span className="text-slate-500">await</span> resolveIdentity(did)</div>
              <div><span className="text-slate-500">const</span> res = <span className="text-slate-500">await</span> fetch(</div>
              <div className="pl-4">{`\`\${pds}/xrpc/com.atproto.repo.getRecord\``}</div>
              <div className="pl-4">+ <span className="text-support">{`\`?repo=\${did}&collection=fund.at.contribute&rkey=self\``}</span></div>
              <div>)</div>
              <div><span className="text-slate-500">const</span> {'{'} value {'}'} = <span className="text-slate-500">await</span> res.json()</div>
              <div className="text-slate-500">{'// value.url → "https://github.com/sponsors/..."'}</div>
            </div>
          </div>

          {/* Show endorsements */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Show endorsements
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              List <code className="font-mono text-xs">fund.at.endorse</code> records from a
              user&apos;s repo to see who they endorse, or count how many users have endorsed a
              given project. Because endorsements live on each endorser&apos;s PDS, the count is
              independently verifiable — not a number the project controls.
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/30 p-4 font-mono text-xs leading-relaxed overflow-x-auto">
              <div><span className="text-slate-500">const</span> res = <span className="text-slate-500">await</span> fetch(</div>
              <div className="pl-4">{`\`\${pds}/xrpc/com.atproto.repo.listRecords\``}</div>
              <div className="pl-4">+ <span className="text-support">{`\`?repo=\${did}&collection=fund.at.endorse&limit=100\``}</span></div>
              <div>)</div>
              <div><span className="text-slate-500">const</span> {'{'} records {'}'} = <span className="text-slate-500">await</span> res.json()</div>
              <div className="text-slate-500">{'// records[].value.uri → endorsed DID or hostname'}</div>
            </div>
          </div>

          {/* Embed a funding button */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Embed a funding button
            </h3>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Drop a compact funding card into any page with an iframe. Works with any DID or
              Bluesky handle.
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/30 p-4 font-mono text-xs leading-relaxed overflow-x-auto">
              <div className="text-slate-500">{'<!-- Embed by DID -->'}</div>
              <div>&lt;iframe <span className="text-support">src=&quot;https://at.fund/embed/did:plc:...&quot;</span></div>
              <div className="pl-4">width=&quot;320&quot; height=&quot;88&quot; frameborder=&quot;0&quot; /&gt;</div>
              <div className="mt-2 text-slate-500">{'<!-- Or by handle -->'}</div>
              <div>&lt;iframe <span className="text-support">src=&quot;https://at.fund/embed/alice.bsky.social&quot;</span></div>
              <div className="pl-4">width=&quot;320&quot; height=&quot;88&quot; frameborder=&quot;0&quot; /&gt;</div>
            </div>
          </div>

          {/* Native integration vision */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Native app integration
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Any AT Protocol app can surface funding natively. The records live on each
              user&apos;s PDS — your app reads them the same way it reads any other record. No
              API key, no centralized registry, no dependency on at.fund the website.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-400">
              <li className="flex gap-2">
                <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
                <span><span className="font-medium text-slate-700 dark:text-slate-300">Profile chip</span> — &quot;Endorsed by 42 people&quot; next to a Bluesky handle</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
                <span><span className="font-medium text-slate-700 dark:text-slate-300">Feed reader</span> — &quot;Support this feed&apos;s creator&quot; pulled from their contribute record</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
                <span><span className="font-medium text-slate-700 dark:text-slate-300">Labeler settings</span> — funding link alongside subscribe/unsubscribe</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
                <span><span className="font-medium text-slate-700 dark:text-slate-300">Journalism</span> — embed card in an article about an AT Protocol project</span>
              </li>
              <li className="flex gap-2">
                <span className="shrink-0 text-slate-400 dark:text-slate-500" aria-hidden>&bull;</span>
                <span><span className="font-medium text-slate-700 dark:text-slate-300">Bots &amp; newsletters</span> — &quot;Most endorsed this week&quot; from aggregated endorsement records</span>
              </li>
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-14">
          <div className="rounded-2xl border border-support-border bg-support-muted px-6 py-8 text-center">
            <h2 className="text-lg font-semibold">Ready?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              The setup page walks you through publishing your records — no AT Protocol expertise required.
            </p>
            <Link
              href="/setup"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-support px-5 py-2.5 text-sm font-semibold text-support-foreground hover:opacity-90 transition-opacity"
            >
              Set up your records →
            </Link>
          </div>
        </section>

        {/* Footer notes */}
        <div className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-8 pb-16 space-y-3 text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
          <p>
            <code className="font-mono">fund.at.*</code> records are the primary way to publish
            funding metadata. For projects that don&apos;t yet have an AT Protocol account,
            AT.fund maintains a curated catalog as a fallback. Published records always take
            precedence.
          </p>
          <p>
            These schemas are a work in progress. This page always reflects the current definitions
            in{' '}
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
        </div>

      </div>
    </div>
  )
}
