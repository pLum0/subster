import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardMaker } from './cards'
import { getPlaylistSongs } from './client'
import type { Song } from './client'

afterEach(() => vi.unstubAllGlobals())

const song = (over: Partial<Song> = {}): Song => ({
  id: 's1',
  title: 'Song',
  artist: 'Artist',
  year: 1984,
  ...over,
})

describe('cardMaker (offline / external-API-free)', () => {
  const make = cardMaker({ onlineMeta: false })

  it('never touches the network — the API-free guarantee', async () => {
    const spy = vi.fn(() => Promise.reject(new Error('network use is forbidden offline')))
    vi.stubGlobal('fetch', spy)
    const card = await make(song({ musicBrainzId: 'mbid', isrc: ['ISRC1'] }))
    expect(card?.year).toBe(1984) // file-tag year, verbatim
    expect(spy).not.toHaveBeenCalled()
  })

  it('drops yearless songs and respects the year range', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect(await make(song({ year: undefined }))).toBeNull()
    expect(await make(song({ year: 0 }))).toBeNull()
    const ranged = cardMaker({ onlineMeta: false, yearFrom: 1990, yearTo: 1999 })
    expect(await ranged(song({ year: 1984 }))).toBeNull()
    expect(await ranged(song({ year: 2005 }))).toBeNull()
    expect((await ranged(song({ year: 1995 })))?.year).toBe(1995)
  })
})

describe('cardMaker (online)', () => {
  it('consults the metadata pipeline (network is used)', async () => {
    // A 503 everywhere: resolveOriginalYear finds nothing and falls back to the
    // file year — but the point here is that fetch WAS attempted.
    const spy = vi.fn().mockResolvedValue({ ok: false, status: 503 } as unknown as Response)
    vi.stubGlobal('fetch', spy)
    const make = cardMaker({}) // onlineMeta defaults to true
    const card = await make(song({ title: 'Online Song A9', artist: 'Nobody Known Z3' }))
    expect(card?.year).toBe(1984)
    expect(spy).toHaveBeenCalled()
  }, 30000)
})

describe('playlist deck build (API-free end to end)', () => {
  it('a full playlist→cards pass touches only the user’s own server', async () => {
    const hosts = new Set<string>()
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        hosts.add(new URL(String(url)).host)
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              'subsonic-response': {
                status: 'ok',
                playlist: {
                  id: 'pl1',
                  entry: [
                    { id: 'a', title: 'One', artist: 'X', year: 1971 },
                    { id: 'b', title: 'Two', artist: 'Y', year: 1999 },
                    { id: 'a', title: 'One', artist: 'X', year: 1971 }, // dupe
                    { id: 'c', title: 'NoYear', artist: 'Z' },
                  ],
                },
              },
            }),
        } as unknown as Response)
      }),
    )
    const config = { name: '', baseUrl: 'https://my.nas.example', username: 'u', salt: 's', token: 't' }
    const songs = await getPlaylistSongs(config, 'pl1')
    expect(songs.map((s) => s.id)).toEqual(['a', 'b', 'c']) // deduped

    const make = cardMaker({ playlistId: 'pl1', onlineMeta: false })
    const cards = (await Promise.all(songs.map((s) => make(s)))).filter(Boolean)
    expect(cards.map((c) => c!.year)).toEqual([1971, 1999]) // yearless dropped

    // The enforceable contract: nothing but the configured Subsonic host.
    expect([...hosts]).toEqual(['my.nas.example'])
  })
})
