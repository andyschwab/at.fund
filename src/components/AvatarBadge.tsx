'use client'

import { useState } from 'react'

export type Actor = {
  did: string
  handle: string
  displayName?: string
  avatar?: string
}

/** Small avatar circle with initials fallback for typeahead results. */
export function AvatarBadge({ actor }: { actor: Actor }) {
  const [failed, setFailed] = useState(false)
  const initials = (actor.displayName ?? actor.handle).slice(0, 2).toUpperCase()
  if (actor.avatar && !failed) {
    return (
      <img
        src={actor.avatar}
        alt=""
        onError={() => setFailed(true)}
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--support-muted)] text-[10px] font-semibold text-[var(--support)]">
      {initials}
    </span>
  )
}
