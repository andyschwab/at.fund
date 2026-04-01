import { describe, it, expect } from 'vitest'
import { stripDerivedCollections } from './repo-collection-resolve'

describe('stripDerivedCollections', () => {
  it('removes calendar collections', () => {
    const input = [
      'community.lexicon.calendar',
      'community.lexicon.calendar.event',
      'community.lexicon.calendar.rsvp',
      'fyi.unravel.frontpage.post',
    ]
    expect(stripDerivedCollections(input)).toEqual([
      'fyi.unravel.frontpage.post',
    ])
  })

  it('removes standard.site collections', () => {
    const input = [
      'site.standard',
      'site.standard.document',
      'site.standard.page',
      'blue.zio.atfile.upload',
    ]
    expect(stripDerivedCollections(input)).toEqual([
      'blue.zio.atfile.upload',
    ])
  })

  it('keeps non-derived collections', () => {
    const input = [
      'fyi.unravel.frontpage.post',
      'blue.zio.atfile.upload',
      'fund.at.contribute',
    ]
    expect(stripDerivedCollections(input)).toEqual(input)
  })

  it('handles empty input', () => {
    expect(stripDerivedCollections([])).toEqual([])
  })

  it('removes both calendar and standard.site together', () => {
    const input = [
      'community.lexicon.calendar.event',
      'site.standard.document',
      'fyi.unravel.frontpage.post',
    ]
    expect(stripDerivedCollections(input)).toEqual([
      'fyi.unravel.frontpage.post',
    ])
  })
})
