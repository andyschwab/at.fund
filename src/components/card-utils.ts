import type { StewardEntry } from '@/lib/steward-model'
import type { NameLinkVariant } from '@/components/card-primitives'

export type CardType = 'tool' | 'account' | 'discover'

export function cardType(entry: StewardEntry): CardType {
  if (entry.tags.includes('tool')) return 'tool'
  if (entry.source === 'unknown' && !entry.capabilities?.length) return 'discover'
  return 'account'
}

export const LINK_VARIANT: Record<CardType, NameLinkVariant> = {
  tool: 'support',
  account: 'network',
  discover: 'discover',
}
