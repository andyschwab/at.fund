import Link from 'next/link'
import { getSessionHandle } from '@/lib/auth/session-handle'
import { getSession } from '@/lib/auth/session'
import { isAdminHandle } from '@/lib/admins'

export default async function AdminPage() {
  const session = await getSession()

  if (!session) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          Sign in to continue.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-sky-700 underline dark:text-sky-400"
        >
          Go to home
        </Link>
      </div>
    )
  }

  const handle = await getSessionHandle(session)
  if (!handle || !isAdminHandle(handle)) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Not authorized</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          This area is only available to administrators.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-sky-700 underline dark:text-sky-400"
        >
          Back to home
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        More tools coming soon. For now, use the API helper below to fingerprint
        PDS hosts and see common platforms.
      </p>
      <div className="mt-8 rounded-lg border border-slate-200 p-4 text-sm dark:border-slate-800">
        <div className="font-medium">PDS platform fingerprinting</div>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          POST newline-separated hostnames (or comma-separated) to{' '}
          <code className="font-mono text-xs">/api/admin/pds-platforms</code>.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md bg-slate-100 p-3 text-xs dark:bg-slate-900">{`curl -s \\
  -H 'content-type: application/json' \\
  -X POST \\
  -d '{"hosts":"bsky.social\\nexample.com"}' \\
  http://localhost:3000/api/admin/pds-platforms | jq`}</pre>
      </div>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-sky-700 underline dark:text-sky-400"
      >
        Back to home
      </Link>
    </div>
  )
}
