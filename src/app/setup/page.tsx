import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getSessionHandle } from '@/lib/auth/session-handle'
import { fetchOwnFundAtRecords } from '@/lib/fund-at-records'
import { SetupClient } from '@/components/SetupClient'
import type { FundAtResult } from '@/lib/fund-at-records'

export const metadata = {
  title: 'Set up your funding profile — at.fund',
}

export default async function SetupPage() {
  const session = await getSession()
  if (!session) {
    redirect('/')
  }

  const [handle, existing] = await Promise.all([
    getSessionHandle(session).catch(() => undefined),
    fetchOwnFundAtRecords(session).catch((): FundAtResult | null => null),
  ])

  return (
    <SetupClient
      did={session.did}
      handle={handle}
      existing={existing}
    />
  )
}
