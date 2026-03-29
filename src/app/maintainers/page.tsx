import Link from 'next/link'

export default function MaintainersPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <Link
        href="/"
        className="text-sm text-sky-700 underline dark:text-sky-400"
      >
        ← Back
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Maintainer-native contribution metadata
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        Tool authors can declare funding and contribution URLs in two ways: (1)
        publish a lexicon record on ATProto, or (2) serve a static JSON file on
        the domain that owns your NSID namespace. Either approach works without
        users opening this app.
      </p>

      <h2 className="mt-10 text-lg font-medium">1. Lexicon record</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Define and publish a lexicon (see{' '}
        <code className="font-mono text-xs">lexicon/fund.at.contribute.json</code>{' '}
        in this repo for a starter schema). Commit the schema to your repo as a{' '}
        <code className="font-mono text-xs">com.atproto.lexicon.schema</code>{' '}
        record, then create one or more{' '}
        <code className="font-mono text-xs">fund.at.contribute</code> records with
        fields such as{' '}
        <code className="font-mono text-xs">appliesToNsidPrefix</code> and{' '}
        <code className="font-mono text-xs">links</code>. Indexers can resolve
        your DID and read those records with{' '}
        <code className="font-mono text-xs">com.atproto.repo.listRecords</code>.
        The canonical NSID tree is{' '}
        <code className="font-mono text-xs">fund.at.*</code> (see{' '}
        <a
          className="text-sky-700 underline dark:text-sky-400"
          href="https://at.fund"
        >
          at.fund
        </a>
        ). If you previously published{' '}
        <code className="font-mono text-xs">com.contribute.tools.funding</code>,
        migrate to <code className="font-mono text-xs">fund.at.contribute</code>{' '}
        (same fields).
      </p>

      <h2 className="mt-8 text-lg font-medium">2. Well-known JSON (no lexicon)</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        On the HTTPS host that matches the authority segment of your NSID (for
        example NSIDs under <code className="font-mono text-xs">com.example.*</code>{' '}
        → host <code className="font-mono text-xs">example.com</code>), serve:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-lg bg-zinc-100 p-4 text-xs dark:bg-zinc-900">
        {`GET https://example.com/.well-known/atproto-contribution.json

{
  "appliesToNsidPrefix": "com.example.myapp.",
  "links": [
    { "label": "GitHub Sponsors", "url": "https://github.com/sponsors/your-org" }
  ],
  "opencollective": "https://opencollective.com/your-project",
  "effectiveDate": "2026-03-29"
}`}
      </pre>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Clients may cache responses; use HTTPS and stable URLs.
      </p>

      <h2 className="mt-8 text-lg font-medium">Catalog PRs</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        This MVP also ships a curated map in{' '}
        <code className="font-mono text-xs">src/data/lexicon-catalog.json</code>.
        Add or correct rows via pull request if you maintain a popular lexicon
        namespace.
      </p>
    </div>
  )
}
