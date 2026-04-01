import Link from 'next/link'

export default function MaintainersPage() {
  return (
    <div className="page-wash min-h-screen">
      <div className="mx-auto max-w-2xl px-6 py-12">

        <Link href="/" className="text-sm text-sky-700 underline dark:text-sky-400">
          ← Back
        </Link>

        {/* Hero */}
        <div className="mt-10">
          <h1 className="text-3xl font-semibold tracking-tight">
            Get found on at.fund
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            If your domain already has an <code className="font-mono text-sm">_atproto</code> TXT
            record — for handle verification, or because you run an ATProto service — AT.fund can
            already resolve your DID. Add your <code className="font-mono text-sm">fund.at.*</code>{' '}
            records and you're done. The setup page walks you through it in minutes.
          </p>
        </div>

        {/* Step 1 */}
        <section className="mt-14">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-support text-support-foreground text-sm font-bold">
              1
            </span>
            <h2 className="text-xl font-semibold">
              Your <code className="font-mono text-lg">_atproto</code> record does the heavy lifting
            </h2>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            When AT.fund encounters a domain — your PDS hostname, a service hostname, anywhere —
            it looks up the <code className="font-mono text-xs">_atproto</code> TXT record to
            find the associated DID. This is the same standard record used across the ATProto
            ecosystem for handle verification, so there is nothing new to learn and often nothing
            new to configure.
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
                No DNS record? There's an HTTPS fallback at{' '}
                <code className="font-mono">/.well-known/atproto-did</code> too.
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
            Once AT.fund resolves your DID, it finds your PDS and fetches your{' '}
            <code className="font-mono text-xs">fund.at.*</code> records. That part is up to you —
            and it's straightforward.
          </p>
        </section>

        {/* Step 2 */}
        <section className="mt-14">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-support text-support-foreground text-sm font-bold">
              2
            </span>
            <h2 className="text-xl font-semibold">Publish three records</h2>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            All records live in your ATProto repo, on any PDS. Use the setup page to create
            them — it handles the ATProto details so you don't have to.
          </p>

          <div className="mt-6 space-y-3">

            {/* disclosure — required */}
            <div className="rounded-xl border border-support-border bg-support-muted p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <code className="font-mono text-sm font-semibold text-support">
                  fund.at.disclosure
                </code>
                <span className="rounded-full bg-support px-2.5 py-0.5 text-xs font-semibold text-support-foreground">
                  required
                </span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Who you are: display name, description, landing page, contact channels, security
                policy URI, and legal/tax pointers. This is what AT.fund shows to donors when
                they're deciding whether to support you.
              </p>
            </div>

            {/* contribute — optional */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <code className="font-mono text-sm font-semibold">
                  fund.at.contribute
                </code>
                <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  optional
                </span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Where to donate: an array of labeled links. GitHub Sponsors, Open Collective,
                Patreon, a direct donation page — include as many as apply. AT.fund surfaces
                all of them.
              </p>
            </div>

            {/* dependencies — optional */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <code className="font-mono text-sm font-semibold">
                  fund.at.dependencies
                </code>
                <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  optional
                </span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                What you build on: a list of DIDs or hostnames for the projects your tool depends
                on. This lets AT.fund surface the full dependency tree to your users, so the
                infrastructure underneath you gets credit too.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-12">
          <div className="rounded-2xl border border-support-border bg-support-muted px-6 py-8 text-center">
            <h2 className="text-lg font-semibold">Ready?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              The setup page creates all three records for you — step by step, no ATProto
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

        {/* Domain scoping footnote */}
        <section className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-8 pb-12">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Domain scoping
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Each record supports an optional{' '}
            <code className="font-mono text-xs">restrictToDomains</code> allowlist. When set,
            the record only applies when AT.fund is looking up that specific hostname — useful
            if you have multiple products under one DID. Leave it empty and your record applies
            everywhere your DID is found.
          </p>
        </section>

      </div>
    </div>
  )
}
