import { describe, it, expect } from 'vitest'
import {
  FUND_DECLARATION,
  FUND_CONTRIBUTE,
  FUND_CHANNEL,
  FUND_PLAN,
  FUND_DEPENDENCY,
  FUND_ENDORSE,
  LEGACY_CONTRIBUTE,
  LEGACY_MANIFEST,
  LEGACY_DEPENDENCY,
  LEGACY_ENDORSE,
} from './fund-at-records'

describe('collection constants', () => {
  it('exports correct new grouped NSIDs', () => {
    expect(FUND_DECLARATION).toBe('fund.at.actor.declaration')
    expect(FUND_CONTRIBUTE).toBe('fund.at.funding.contribute')
    expect(FUND_CHANNEL).toBe('fund.at.funding.channel')
    expect(FUND_PLAN).toBe('fund.at.funding.plan')
    expect(FUND_DEPENDENCY).toBe('fund.at.graph.dependency')
    expect(FUND_ENDORSE).toBe('fund.at.graph.endorse')
  })

  it('exports correct legacy NSIDs for migration', () => {
    expect(LEGACY_CONTRIBUTE).toBe('fund.at.contribute')
    expect(LEGACY_MANIFEST).toBe('fund.at.manifest')
    expect(LEGACY_DEPENDENCY).toBe('fund.at.dependency')
    expect(LEGACY_ENDORSE).toBe('fund.at.endorse')
  })
})
