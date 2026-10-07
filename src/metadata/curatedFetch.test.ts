import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ServerConfig } from '../store/configStore'
import type { Song } from '../subsonic/client'

const getArtists = vi.fn<(folder?: string) => Promise<string[]>>()
const getMusicFolders = vi.fn<() => Promise<Array<{ id: string; name: string }>>>()
const search3 = vi.fn<
  (c: ServerConfig, o: { query: string; musicFolderId?: string }) => Promise<Song[]>
>()
vi.mock('../subsonic/client', async (importOriginal) => ({
  mainArtist: (await importOriginal<typeof import('../subsonic/client')>()).mainArtist,
  getArtists: (_c: ServerConfig, folder?: string) => getArtists(folder),
  getMusicFolders: () => getMusicFolders(),
  search3: (c: ServerConfig, o: { query: string }) => search3(c, o),
}))

const { findCuratedSongs, scanCuratedSongs } = await import('./curatedFetch')

// The yes/no cache is module-level and persists across tests — each test uses
// its own server id, which is part of the cache key.
function server(baseUrl: string): ServerConfig {
  return { id: baseUrl, name: 'x', baseUrl, username: 'u', salt: 'ab', token: 'cd' }
}

const opts = { want: 10, maxSearches: 50 }

beforeEach(() => {
  getArtists.mockReset().mockResolvedValue(['10cc'])
  // No library list by default: one unscoped search per song.
  getMusicFolders.mockReset().mockResolvedValue([])
  search3.mockReset()
})

describe('findCuratedSongs', () => {
  it('resolves a known canon song afresh each game, so a changed id is never reused', async () => {
    const config = server('https://ids.example')
    search3.mockImplementation(async (_c, o) =>
      o.query.includes("I'm Not in Love")
        ? [{ id: 'old-id', title: "I'm Not in Love", artist: '10cc' }]
        : [],
    )
    expect((await findCuratedSongs(config, opts)).map((s) => s.id)).toEqual(['old-id'])

    // The server rescanned and the song got a new id.
    search3.mockImplementation(async (_c, o) =>
      o.query.includes("I'm Not in Love")
        ? [{ id: 'new-id', title: "I'm Not in Love", artist: '10cc' }]
        : [],
    )
    expect((await findCuratedSongs(config, opts)).map((s) => s.id)).toEqual(['new-id'])
  })

  it('keeps searching new canon songs instead of locking onto the first finds', async () => {
    const config = server('https://rotation.example')
    getArtists.mockResolvedValue(['Queen'])
    // Every Queen canon song is in the library.
    search3.mockImplementation(async (_c, o) => [
      { id: o.query, title: o.query.replace(/^Queen /, ''), artist: 'Queen' },
    ])
    const few = { want: 4, maxSearches: 50 }
    const seen = new Set<string>()
    for (let game = 0; game < 4; game++) {
      for (const s of await findCuratedSongs(config, few)) seen.add(s.id)
    }
    // Known-first ordering returned the first game's songs forever.
    expect(seen.size).toBeGreaterThan(4)
  })

  it('caches misses, so a song known to be absent is not searched again', async () => {
    const config = server('https://miss.example')
    search3.mockResolvedValue([])
    expect(await findCuratedSongs(config, opts)).toEqual([])
    const firstRun = search3.mock.calls.length
    expect(firstRun).toBeGreaterThan(0)

    await findCuratedSongs(config, opts)
    expect(search3.mock.calls.length).toBe(firstRun) // every 10cc canon song is a cached miss
  })

  it('does not cache a miss when the search itself fails', async () => {
    const config = server('https://flaky.example')
    search3.mockRejectedValue(new Error('offline'))
    expect(await findCuratedSongs(config, opts)).toEqual([])

    search3.mockReset().mockImplementation(async (_c, o) =>
      o.query.includes("I'm Not in Love")
        ? [{ id: 'id', title: "I'm Not in Love", artist: '10cc' }]
        : [],
    )
    expect((await findCuratedSongs(config, opts)).map((s) => s.id)).toEqual(['id'])
  })

  it('searches only the chosen libraries that hold the artist', async () => {
    const config = server('https://scoped.example')
    getArtists.mockImplementation(async (folder) => (folder === 'b' ? ['10cc'] : ['Somebody Else']))
    search3.mockImplementation(async (_c, o) =>
      o.query.includes("I'm Not in Love")
        ? [{ id: 'id', title: "I'm Not in Love", artist: '10cc' }]
        : [],
    )
    const found = await findCuratedSongs(config, { ...opts, musicFolderIds: ['a', 'b'] })
    expect(found.map((s) => s.id)).toEqual(['id'])
    expect(new Set(search3.mock.calls.map(([, o]) => o.musicFolderId))).toEqual(new Set(['b']))
  })

  it('still searches the libraries it could list when another fails', async () => {
    const config = server('https://partial.example')
    getArtists.mockImplementation(async (folder) => {
      if (folder === 'a') throw new Error('offline')
      return ['10cc']
    })
    search3.mockResolvedValue([])
    await findCuratedSongs(config, { ...opts, musicFolderIds: ['a', 'b'] })
    expect(search3).toHaveBeenCalled()
  })

  it('searches every library for "all libraries", sharing the cache with a game over one', async () => {
    const config = server('https://all.example')
    getMusicFolders.mockResolvedValue([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ])
    getArtists.mockImplementation(async (folder) => (folder === 'b' ? ['10cc'] : []))
    search3.mockResolvedValue([])
    await findCuratedSongs(config, opts)
    expect(new Set(search3.mock.calls.map(([, o]) => o.musicFolderId))).toEqual(new Set(['b']))

    search3.mockClear()
    await findCuratedSongs(config, { ...opts, musicFolderIds: ['b'] })
    expect(search3).not.toHaveBeenCalled() // every miss already known
  })

  it('shares what it learned between the LAN and the public address of a server', async () => {
    const home = server('http://lan.example')
    const away = { ...home, baseUrl: 'https://public.example' }
    search3.mockResolvedValue([])
    await findCuratedSongs(home, opts)
    search3.mockClear()
    await findCuratedSongs(away, opts)
    expect(search3).not.toHaveBeenCalled()
  })
})

describe('findCuratedSongs with hit lists', () => {
  it('only searches songs on the chosen lists', async () => {
    const config = server('https://lists.example')
    getArtists.mockResolvedValue(['ABBA'])
    search3.mockResolvedValue([])
    await findCuratedSongs(config, { ...opts, hitLists: ['intl'] })
    const queries = search3.mock.calls.map(([, o]) => o.query)
    expect(queries.length).toBeGreaterThan(0)
    expect(queries).not.toContain('ABBA One of Us') // a German number one only

    search3.mockClear()
    await findCuratedSongs(server('https://lists-de.example'), { ...opts, hitLists: ['de'] })
    expect(search3.mock.calls.map(([, o]) => o.query)).toContain('ABBA One of Us')
  })
})

describe('scanCuratedSongs', () => {
  it('searches every canon song once, counts the ones present, and reports progress', async () => {
    const config = server('https://scan.example')
    getArtists.mockResolvedValue(['Queen'])
    search3.mockImplementation(async (_c, o) =>
      o.query.includes('Bohemian Rhapsody')
        ? [{ id: 'bo', title: 'Bohemian Rhapsody', artist: 'Queen' }]
        : [],
    )
    const progress: Array<[number, number]> = []
    const result = await scanCuratedSongs(config, (d, t) => progress.push([d, t]))
    expect(result?.inLibrary).toBe(1)
    expect(result?.bundled).toBeGreaterThan(1000)
    const total = search3.mock.calls.length
    expect(total).toBeGreaterThan(1)
    expect(progress[progress.length - 1]).toEqual([total, total])
    expect(result?.byArtists).toBe(total) // every Queen song, one search each

    // Everything is known now: a game goes straight to the one song that is there.
    search3.mockClear()
    expect((await findCuratedSongs(config, opts)).map((s) => s.id)).toEqual(['bo'])
    expect(search3).toHaveBeenCalledTimes(1)

    // A song added to the library since: a game would never look again, a
    // second scan does.
    search3.mockClear()
    search3.mockImplementation(async (_c, o) =>
      o.query.includes('Bohemian Rhapsody') || o.query.includes('Under Pressure')
        ? [{ id: o.query, title: o.query.replace(/^Queen /, ''), artist: 'Queen' }]
        : [],
    )
    expect((await scanCuratedSongs(config))?.inLibrary).toBe(2)
    expect(search3).toHaveBeenCalledTimes(total)
  })

  it('reports null when the server cannot list its artists', async () => {
    getArtists.mockRejectedValue(new Error('offline'))
    expect(await scanCuratedSongs(server('https://down.example'))).toBeNull()
  })
})
