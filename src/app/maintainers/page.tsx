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
      <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        Tool authors can publish disclosure, contribution links, and dependency
        pointers as ATProto records. Clients discover these records from either a
        DID directly, or from a hostname by resolving its ATProto DID via DNS{' '}
        <code className="font-mono text-xs">_atproto</code>.
      </p>

      <h2 className="mt-10 text-lg font-medium">1. Lexicon records</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Define and publish lexicons (see{' '}
        <code className="font-mono text-xs">lexicon/fund.at.contribute.json</code>,{' '}
        <code className="font-mono text-xs">lexicon/fund.at.disclosure.json</code>,{' '}
        and{' '}
        <code className="font-mono text-xs">lexicon/fund.at.dependencies.json</code>{' '}
        in this repo). Commit each schema to your repo as a{' '}
        <code className="font-mono text-xs">com.atproto.lexicon.schema</code>{' '}
        record, then create records on your steward DID:{' '}
        <code className="font-mono text-xs">fund.at.contribute</code> for funding
        links (with optional{' '}
        <code className="font-mono text-xs">restrictToDomains</code>),{' '}
        <code className="font-mono text-xs">fund.at.disclosure</code> for
        donor-relevant identity, contact, security, and legal pointers, and{' '}
        <code className="font-mono text-xs">fund.at.dependencies</code> for a
        list of dependency identifiers (DIDs or hostnames; optionally scoped with{' '}
        <code className="font-mono text-xs">appliesToNsidPrefix</code>). Indexers
        resolve your DID and read records with{' '}
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
        (domain-scoped <code className="font-mono text-xs">links</code> and{' '}
        <code className="font-mono text-xs">restrictToDomains</code>).
      </p>

      <h2 className="mt-8 text-lg font-medium">
        2. DNS <code className="font-mono text-base">_atproto</code>
      </h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Publish a TXT record at <code className="font-mono text-xs">_atproto.&lt;hostname&gt;</code>{' '}
        whose value is your site/service DID. Clients can then resolve the DID to
        a PDS and fetch <code className="font-mono text-xs">fund.at.disclosure</code>{' '}
        (required), plus optional{' '}
        <code className="font-mono text-xs">fund.at.contribute</code> and{' '}
        <code className="font-mono text-xs">fund.at.dependencies</code>. Full spec:{' '}
        <span className="font-mono text-xs">docs/atfund-discovery.md</span> in
        this repository.
      </p>

      <h2 className="mt-8 text-lg font-medium">Catalog PRs</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        This MVP also ships a curated catalog in{' '}
        <code className="font-mono text-xs">src/data/catalog/</code> — one JSON
        file per steward. Add or correct entries via pull request if you
        maintain a service on ATProto.
      </p>
    </div>
  )
}
