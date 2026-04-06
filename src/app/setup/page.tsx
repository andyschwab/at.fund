import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { getSessionHandle } from '@/lib/auth/session-handle'

/**
 * /setup now redirects to the unified profile page in edit mode.
 * LandingPage CTAs still point here, so this redirect is needed.
 */
export default async function SetupRedirect() {
  const session = await getSession()
  if (!session) {
    redirect('/')
  }

  const handle = await getSessionHandle(session).catch(() => undefined)
  const identifier = handle ?? session.did
  redirect(`/${identifier}?edit=true`)
}
