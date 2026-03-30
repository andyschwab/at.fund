import { HomeClient } from '@/components/HomeClient'
import { getSession } from '@/lib/auth/session'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const session = await getSession()
  const sp = await searchParams

  return (
    <HomeClient
      hasSession={!!session}
      error={sp.error}
    />
  )
}
