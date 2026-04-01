// Drop-in replacement for Lucide's Heart icon, using the at.fund droplet mark.
// Matches the Lucide prop API exactly so call sites only need to change the import.

type Props = {
  className?: string
  strokeWidth?: number
  'aria-hidden'?: boolean | 'true'
}

export function DropletIcon({ className, strokeWidth = 1.5, 'aria-hidden': ariaHidden }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
    >
      {/* Teardrop: pointed tip at top, rounded base — sweep 0 = counterclockwise arc downward */}
      <path d="M12 2 C7 9,5 14,5 17 A7 7 0 0 0 19 17 C19 14,17 9,12 2 Z" />
    </svg>
  )
}
