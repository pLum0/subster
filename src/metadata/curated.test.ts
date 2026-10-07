import { describe, expect, it } from 'vitest'
import { artistKey, curatedEntries, curatedKey, HIT_LISTS, isCurated } from './curated'
import curatedDict from './curated.json'

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

  it('matches regional number ones that once had songwriter credits glued on', () => {
    // Only in the German list; stored as "Skandal im SperrbezirkGünther Sigl" before.
    expect(isCurated('Spider Murphy Gang', 'Skandal im Sperrbezirk')).toBe(true)
    expect(isCurated('Rainhard Fendrich', 'Strada del sole')).toBe(true)
  })

  it('holds no titles with songwriter credits glued on (a scraping leftover)', () => {
    // "Easy on MeAdele Atkins, Greg Kurstin": a title running straight into a
    // capitalized name. Real titles that look like that are listed here.
    const glued = /[a-zäöüß0-9!?).’…][A-ZÄÖÜ][a-zäöüß]+ [A-ZÄÖÜ][a-zäöüß]+(,|$)/
    const legit = new Set(['MacArthur Park'])
    const regions = curatedDict as Record<string, Record<string, string[]>>
    const bad = Object.entries(regions).flatMap(([region, artists]) =>
      Object.entries(artists).flatMap(([artist, titles]) =>
        titles.filter((t) => glued.test(t) && !legit.has(t)).map((t) => `${region}: ${artist} – ${t}`),
      ),
    )
    expect(bad).toEqual([])
  })
})

describe('hit lists', () => {
  it('lists the bundled ones, international first', () => {
    expect(HIT_LISTS[0]).toBe('intl')
    expect(HIT_LISTS).toEqual(expect.arrayContaining(['de', 'at', 'ch']))
  })

  it('counts a song as famous only on the chosen lists', () => {
    // A German number one that is on no other list.
    expect(isCurated('ABBA', 'One of Us')).toBe(true)
    expect(isCurated('ABBA', 'One of Us', ['de'])).toBe(true)
    expect(isCurated('ABBA', 'One of Us', ['intl', 'ch'])).toBe(false)
    expect(isCurated('ABBA', 'One of Us', [])).toBe(true) // none chosen = all
  })

  it('records every list a song is on', () => {
    const entry = curatedEntries.find((e) => curatedKey(e.artist, e.title) === curatedKey('ABBA', 'One of Us'))
    expect(entry?.lists).toEqual(['de'])
    expect(curatedEntries.some((e) => e.lists.length > 1)).toBe(true)
  })
})
