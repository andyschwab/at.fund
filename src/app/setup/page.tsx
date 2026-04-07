import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

/**
 * /setup now redirects to the unified profile page in edit mode.
 * LandingPage CTAs still point here, so this redirect is needed.
 */
export default async function SetupRedirect() {
  const cookieStore = await cookies()
  const did = cookieStore.get('did')?.value
  if (!did) {
    redirect('/')
  }

  const handle = cookieStore.get('handle')?.value
  redirect(`/${handle ?? did}?edit=true`)
}
