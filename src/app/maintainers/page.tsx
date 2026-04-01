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
            Get found on AT.fund
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
            <h2 className="text-xl font-semibold">Publish your records</h2>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            All records live in your ATProto repo, on any PDS. Use the setup page to create
            them -- it handles the ATProto details so you don&apos;t have to.
          </p>

          <div className="mt-6 space-y-3">

            {/* contribute */}
            <div className="rounded-xl border border-support-border bg-support-muted p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <code className="font-mono text-sm font-semibold text-support">
                  fund.at.contribute
                </code>
                <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  singleton
                </span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Your funding page URL -- GitHub Sponsors, Open Collective, Patreon,
                or any page where people can support you. One record per repo.
              </p>
            </div>

            {/* dependency */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <code className="font-mono text-sm font-semibold">
                  fund.at.dependency
                </code>
                <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  one per dep
                </span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                What you build on: a DID or hostname for each project your tool depends
                on. This lets AT.fund surface the full dependency tree to your users, so the
                infrastructure underneath you gets credit too.
              </p>
            </div>

            {/* watch */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <code className="font-mono text-sm font-semibold">
                  fund.at.watch
                </code>
                <span className="rounded-full bg-sky-200 dark:bg-sky-700 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:text-sky-100">
                  new
                </span>
              </div>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                A watchlist entry: track the funding status of an entity you care about,
                even if you don&apos;t depend on it directly.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mt-12">
          <div className="rounded-2xl border border-support-border bg-support-muted px-6 py-8 text-center">
            <h2 className="text-lg font-semibold">Ready?</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              The setup page creates your records for you -- step by step, no ATProto
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
        <section className="mt-10 border-t border-slate-200 dark:border-slate-800 pt-8 pb-12">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            Record keys
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            <code className="font-mono text-xs">fund.at.contribute</code> uses a{' '}
            <code className="font-mono text-xs">literal:self</code> key -- one record per repo.{' '}
            <code className="font-mono text-xs">fund.at.dependency</code> and{' '}
            <code className="font-mono text-xs">fund.at.watch</code> use{' '}
            <code className="font-mono text-xs">tid</code> keys so you can create multiple
            records per repo. See the{' '}
            <Link href="/lexicon" className="text-sky-700 underline dark:text-sky-400">
              lexicon page
            </Link>{' '}
            for full schema details.
          </p>
        </section>

      </div>
    </div>
  )
}
