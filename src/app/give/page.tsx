import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { GiveClient } from '@/components/GiveClient'

export default async function GivePage() {
  const session = await getSession()
  if (!session) redirect('/')

  return <GiveClient />
}
