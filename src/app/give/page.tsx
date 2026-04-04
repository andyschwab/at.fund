import { GiveClient } from '@/components/GiveClient'
import { RequireSession } from '@/components/RequireSession'

export default function GivePage() {
  return (
    <RequireSession>
      <GiveClient />
    </RequireSession>
  )
}
