// Drop-in replacement using the at.fund handshake heart mark.
// Matches the Lucide prop API exactly so call sites only need to change the import.

import { HeartHandshake } from 'lucide-react'

type Props = {
  className?: string
  strokeWidth?: number
  'aria-hidden'?: boolean | 'true'
}

export function DropletIcon({ className, strokeWidth = 1.5, 'aria-hidden': ariaHidden }: Props) {
  return (
    <HeartHandshake
      className={className}
      strokeWidth={strokeWidth}
      aria-hidden={ariaHidden}
    />
  )
}
