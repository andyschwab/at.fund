'use client'

import { useState } from 'react'
import type { ScanResult } from '@/lib/lexicon-scan'
import { pdslsCollectionUrl, pdslsRepoUrl } from '@/lib/pdsls'

type Props = {
  hasSession: boolean
  initialScan: ScanResult | null
  error?: string
}

export function HomeClient({ hasSession, initialScan, error }: Props) {
  const [handle, setHandle] = useState('')
  const [loading, setLoading] = useState(false)
  const [scan, setScan] = useState<ScanResult | null>(initialScan)
  const [selfReport, setSelfReport] = useState('')
  const [err, setErr] = useState<string | null>(
    error ? 'Sign-in failed. Try again.' : null,
  )

  async function login(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/oauth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Login failed')
      window.location.href = data.redirectUrl
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Login failed')
      setLoading(false)
    }
  }

  async function logout() {
    await fetch('/oauth/logout', { method: 'POST' })
    window.location.reload()
  }

  async function runScan(extra: string[]) {
    setLoading(true)
    setErr(null)
    try {
      const res = await fetch('/api/lexicons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selfReportedNsids: extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Scan failed')
      setScan(data)
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Scan failed')
    } finally {
      setLoading(false)
    }
  }

  function parseSelfReportInput(): string[] {
    return selfReport
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const collectionCount =
    scan?.appGroups.reduce((n, g) => n + g.collections.length, 0) ?? 0
  const appCount = scan?.appGroups.length ?? 0

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-10 px-4 py-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Contribute to your ATProto tools
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Connect with your handle. We read{' '}
          <strong className="font-medium text-zinc-800 dark:text-zinc-200">
            which record collections exist in your repository
          </strong>{' '}
          (lexicon NSIDs you have actually used), drop Bluesky-app noise, then
          match what we can to apps and contribution links. This is not a full
          list of every client you have opened—only data your account has
          stored.
        </p>
      </header>

      {!hasSession ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="mb-4 text-lg font-medium">Connect</h2>
          <form onSubmit={login} className="flex max-w-md flex-col gap-3">
            <label className="text-sm text-zinc-600 dark:text-zinc-400">
              ATProto handle
              <input
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="you.bsky.social"
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                disabled={loading}
                required
              />
            </label>
            {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}
            <button
              type="submit"
              disabled={loading || !handle.trim()}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {loading ? 'Redirecting…' : 'Connect with ATProto'}
            </button>
            <p className="text-xs text-zinc-500">
              Use <code className="font-mono">127.0.0.1</code> in development
              (not <code className="font-mono">localhost</code>) so OAuth
              redirects match.
            </p>
          </form>
        </section>
      ) : (
        <>
          <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="text-sm">
              <span className="text-zinc-500">Signed in</span>{' '}
              <span className="font-mono text-zinc-900 dark:text-zinc-100">
                {scan?.handle ?? scan?.did ?? '…'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {scan?.did && (
                <a
                  href={pdslsRepoUrl(scan.did)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
                >
                  Open repo in PDSls
                </a>
              )}
              <button
                type="button"
                onClick={() => runScan(parseSelfReportInput())}
                disabled={loading}
                className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-600"
              >
                {loading ? 'Scanning…' : 'Scan again'}
              </button>
              <button
                type="button"
                onClick={() => logout()}
                className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
              >
                Sign out
              </button>
            </div>
          </section>

          {err && (
            <p className="text-sm text-red-600 dark:text-red-400">{err}</p>
          )}

          <section className="space-y-4">
            <h2 className="text-lg font-medium">Apps and projects</h2>
            {!scan ? (
              <p className="text-sm text-zinc-500">
                Could not load scan.{' '}
                <button
                  type="button"
                  onClick={() => runScan([])}
                  className="text-zinc-900 underline dark:text-zinc-100"
                >
                  Retry
                </button>
              </p>
            ) : scan.appGroups.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No third-party collections found in your repo (after filtering
                Bluesky app and protocol collections). Add NSIDs you care about
                below—future versions can use more signals.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50">
                    <tr>
                      <th className="px-3 py-2 font-medium">App / project</th>
                      <th className="px-3 py-2 font-medium">Contribute</th>
                      <th className="px-3 py-2 font-medium">Match</th>
                      <th className="w-px px-3 py-2 font-medium whitespace-nowrap">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {scan.appGroups.map((group) => (
                      <tr
                        key={group.appName}
                        className="border-b border-zinc-100 dark:border-zinc-800/80"
                      >
                        <td className="px-3 py-2 font-medium">{group.appName}</td>
                        <td className="px-3 py-2">
                          {group.links.length === 0 ? (
                            <span className="text-zinc-400">Unknown</span>
                          ) : (
                            <ul className="space-y-1">
                              {group.links.map((l) => (
                                <li key={l.url}>
                                  <a
                                    href={l.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sky-700 underline dark:text-sky-400"
                                  >
                                    {l.label}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                          {group.notes && (
                            <p className="mt-1 text-xs text-zinc-500">
                              {group.notes}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 capitalize text-zinc-700 dark:text-zinc-300">
                          {group.confidence}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <details>
                            <summary className="cursor-pointer text-sky-700 underline marker:text-zinc-400 dark:text-sky-400">
                              Lexicon collections ({group.collections.length})
                            </summary>
                            <ul className="mt-2 max-w-md space-y-2 border-l border-zinc-200 pl-3 dark:border-zinc-700">
                              {group.collections.map((c) => (
                                <li
                                  key={c}
                                  className="font-mono text-xs text-zinc-700 dark:text-zinc-300"
                                >
                                  <span className="break-all">{c}</span>
                                  {scan.did && (
                                    <>
                                      {' '}
                                      <a
                                        href={pdslsCollectionUrl(scan.did, c)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-sans text-sky-700 underline dark:text-sky-400"
                                      >
                                        PDSls
                                      </a>
                                    </>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-zinc-500">
              Repo collections: {scan?.repoCollectionCount ?? '—'} total ·{' '}
              {appCount} app{appCount === 1 ? '' : 's'} matched · {collectionCount}{' '}
              lexicon collection{collectionCount === 1 ? '' : 's'} grouped under them.
            </p>
          </section>

          <section className="rounded-xl border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
            <h3 className="mb-2 font-medium">Self-reported NSIDs</h3>
            <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
              Optional: add collection NSIDs (space or comma separated) to
              include even if they are not in your repo yet.
            </p>
            <div className="flex max-w-xl flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={selfReport}
                onChange={(e) => setSelfReport(e.target.value)}
                placeholder="e.g. blue.linkat.post"
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => runScan(parseSelfReportInput())}
                disabled={loading}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white dark:bg-zinc-100 dark:text-zinc-900"
              >
                Merge into results
              </button>
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-6 dark:border-zinc-800 dark:bg-zinc-900/40">
        <h2 className="mb-2 text-lg font-medium">For maintainers</h2>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Publish a small lexicon record (or host a JSON file on your domain) so
          any client can discover how to support your project—no dependency on
          this app.
        </p>
        <a
          href="/maintainers"
          className="text-sm font-medium text-sky-700 underline dark:text-sky-400"
        >
          Lexicon template and .well-known fallback
        </a>
      </section>
    </div>
  )
}
