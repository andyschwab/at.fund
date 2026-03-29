import { HomeClient } from '@/components/HomeClient'
import { scanRepo } from '@/lib/lexicon-scan'
import { getSession } from '@/lib/auth/session'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await getSession()
  const sp = await searchParams

  let initialScan = null
  if (session) {
    try {
      initialScan = await scanRepo(session, [])
    } catch (e) {
      console.error('Initial scan failed:', e)
    }
  }

  return (
    <HomeClient
      hasSession={!!session}
      initialScan={initialScan}
      error={sp.error}
    />
  )
}
