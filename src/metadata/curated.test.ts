import { describe, expect, it } from 'vitest'
import { artistKey, curatedEntries, curatedKey, isCurated } from './curated'

describe('curated famous-songs canon', () => {
  it('bundles a large set (Billboard + greatest-songs + per-country #1s)', () => {
    expect(curatedEntries.length).toBeGreaterThan(5000)
  })

  it('matches known canonical songs', () => {
    expect(isCurated('Bob Dylan', 'Like a Rolling Stone')).toBe(true)
    expect(isCurated('Nirvana', 'Smells Like Teen Spirit')).toBe(true)
    expect(isCurated('Aretha Franklin', 'Respect')).toBe(true)
  })

  it('includes per-country #1s (German-language)', () => {
    // Peter Maffay, Dschinghis Khan — German #1s that Billboard/critics miss.
    const artists = new Set(curatedEntries.map((e) => artistKey(e.artist)))
    expect(artists.has(artistKey('Peter Maffay'))).toBe(true)
    expect(artists.has(artistKey('Dschinghis Khan'))).toBe(true)
  })

  it('is tolerant of remaster/version suffixes and leading articles', () => {
    expect(isCurated('Nirvana', 'Smells Like Teen Spirit (Remastered 2021)')).toBe(true)
    // "The Beatles" vs "Beatles" — leading article is normalized away.
    expect(curatedKey('The Beatles', 'Hey Jude')).toBe(curatedKey('Beatles', 'Hey Jude'))
  })

  it('rejects unknown songs', () => {
    expect(isCurated('Some Local Band', 'An Obscure Track Nobody Knows')).toBe(false)
  })
})
