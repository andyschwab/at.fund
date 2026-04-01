import { describe, it, expect } from 'vitest'
import { isNoiseCollection, filterThirdPartyCollections } from './repo-inspect'

describe('isNoiseCollection', () => {
  it('identifies Bluesky app collections as noise', () => {
    expect(isNoiseCollection('app.bsky.feed.post')).toBe(true)
    expect(isNoiseCollection('app.bsky.actor.profile')).toBe(true)
    expect(isNoiseCollection('app.bsky.graph.follow')).toBe(true)
  })

  it('identifies ATProto protocol collections as noise', () => {
    expect(isNoiseCollection('com.atproto.repo.strongRef')).toBe(true)
    expect(isNoiseCollection('com.atproto.label.label')).toBe(true)
  })

  it('identifies chat collections as noise', () => {
    expect(isNoiseCollection('chat.bsky.convo')).toBe(true)
  })

  it('passes through third-party collections', () => {
    expect(isNoiseCollection('fyi.unravel.frontpage.post')).toBe(false)
    expect(isNoiseCollection('community.lexicon.calendar')).toBe(false)
    expect(isNoiseCollection('blue.zio.atfile.upload')).toBe(false)
    expect(isNoiseCollection('fund.at.contribute')).toBe(false)
  })
})

describe('filterThirdPartyCollections', () => {
  it('removes all noise collections, keeps third-party', () => {
    const input = [
      'app.bsky.feed.post',
      'app.bsky.actor.profile',
      'com.atproto.repo.strongRef',
      'chat.bsky.convo',
      'fyi.unravel.frontpage.post',
      'blue.zio.atfile.upload',
      'community.lexicon.calendar',
    ]
    expect(filterThirdPartyCollections(input)).toEqual([
      'fyi.unravel.frontpage.post',
      'blue.zio.atfile.upload',
      'community.lexicon.calendar',
    ])
  })

  it('returns empty array when all collections are noise', () => {
    expect(filterThirdPartyCollections([
      'app.bsky.feed.post',
      'com.atproto.label.label',
    ])).toEqual([])
  })

  it('handles empty input', () => {
    expect(filterThirdPartyCollections([])).toEqual([])
  })
})
