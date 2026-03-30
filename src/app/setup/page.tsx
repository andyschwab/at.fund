import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getSessionHandle } from '@/lib/auth/session-handle'
import { fetchFundAtRecords } from '@/lib/fund-at-records'
import { SetupClient } from '@/components/SetupClient'
import type { FundAtResult } from '@/lib/fund-at-records'

export const metadata = {
  title: 'Set up your funding profile — AT.fund',
}

export default async function SetupPage() {
  const session = await getSession()
  if (!session) {
    redirect('/')
  }

  const [handle, existing] = await Promise.all([
    getSessionHandle(session).catch(() => undefined),
    fetchFundAtRecords(session.did).catch((): FundAtResult | null => null),
  ])

  return (
    <SetupClient
      did={session.did}
      handle={handle}
      existing={existing}
    />
  )
}
