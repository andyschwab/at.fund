import { describe, it, expect } from 'vitest'
import {
  FUND_CONTRIBUTE,
  FUND_DEPENDENCY,
  FUND_WATCH,
} from './fund-at-records'

describe('collection constants', () => {
  it('exports correct collection NSIDs', () => {
    expect(FUND_CONTRIBUTE).toBe('fund.at.contribute')
    expect(FUND_DEPENDENCY).toBe('fund.at.dependency')
    expect(FUND_WATCH).toBe('fund.at.watch')
  })
})
