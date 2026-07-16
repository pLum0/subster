import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  buildUrl,
  getPlaylists,
  getPlaylistSongs,
  getRandomSongs,
  ping,
  resolveEffectiveServer,
} from './client'
import type { ServerConfig } from '../store/configStore'

const config: ServerConfig = {
  name: 'x',
  baseUrl: 'https://s.example',
  username: 'u',
  salt: 'ab',
  token: 'cd',
}

/** A minimal fetch Response whose .json() resolves to `body`. */
function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  } as unknown as Response
}

function failedEnvelope(code: number, message: string): unknown {
  return { 'subsonic-response': { status: 'failed', error: { code, message } } }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('error mapping', () => {
  it('maps a failed response with code 40 to an auth error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(failedEnvelope(40, 'Wrong credentials'))),
    )
    await expect(getRandomSongs(config)).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'auth',
      message: 'Wrong credentials',
    })
    expect(await ping(config)).toMatchObject({ ok: false, kind: 'auth' })
  })

  it('maps a failed response with a non-40 code to a server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(failedEnvelope(70, 'Data not found'))),
    )
    await expect(getRandomSongs(config)).rejects.toMatchObject({ name: 'ApiError', kind: 'server' })
  })

  it('maps a non-JSON body to a server error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      } as unknown as Response),
    )
    const err = await getRandomSongs(config).then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).kind).toBe('server')
  })

  it('maps a missing subsonic-response envelope to a server error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})))
    await expect(getRandomSongs(config)).rejects.toMatchObject({ name: 'ApiError', kind: 'server' })
  })

  it('maps a thrown TypeError (network/CORS) to a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getRandomSongs(config)).rejects.toMatchObject({ name: 'ApiError', kind: 'network' })
    expect(await ping(config)).toMatchObject({ ok: false, kind: 'network' })
  })
})

describe('buildUrl', () => {
  it('strips trailing slashes and includes the auth params', () => {
    const url = new URL(buildUrl({ ...config, baseUrl: 'https://s.example//' }, 'ping.view'))
    expect(url.origin).toBe('https://s.example')
    expect(url.pathname).toBe('/rest/ping.view')
    expect(url.searchParams.get('u')).toBe('u')
    expect(url.searchParams.get('t')).toBe('cd')
    expect(url.searchParams.get('s')).toBe('ab')
    expect(url.searchParams.get('v')).toBe('1.16.1')
    expect(url.searchParams.get('c')).toBe('subster')
    expect(url.searchParams.get('f')).toBe('json')
  })

  it('omits undefined and empty-string params but sets custom ones', () => {
    const url = new URL(
      buildUrl(config, 'getRandomSongs.view', { size: 10, genre: undefined, musicFolderId: '' }),
    )
    expect(url.searchParams.get('size')).toBe('10')
    expect(url.searchParams.has('genre')).toBe(false)
    expect(url.searchParams.has('musicFolderId')).toBe(false)
  })
})

describe('playlists', () => {
  it('lists playlists with normalized ids and song counts', async () => {
    const body = {
      'subsonic-response': {
        status: 'ok',
        playlists: { playlist: [{ id: 7, name: 'Party', songCount: 42 }, { id: '8' }] },
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))
    expect(await getPlaylists(config)).toEqual([
      { id: '7', name: 'Party', songCount: 42 },
      { id: '8', name: '8', songCount: 0 },
    ])
  })

  it('returns a playlist’s songs deduped by id', async () => {
    const body = {
      'subsonic-response': {
        status: 'ok',
        playlist: {
          id: '7',
          entry: [
            { id: 'a', title: 'One', artist: 'X', year: 1971 },
            { id: 'b', title: 'Two', artist: 'Y' },
            { id: 'a', title: 'One', artist: 'X', year: 1971 },
          ],
        },
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))
    const songs = await getPlaylistSongs(config, '7')
    expect(songs.map((s) => s.id)).toEqual(['a', 'b'])
  })
})

describe('resolveEffectiveServer', () => {
  const withLocal: ServerConfig = { ...config, localBaseUrl: 'http://192.168.1.9:4533' }
  const okPing = jsonResponse({ 'subsonic-response': { status: 'ok' } })

  it('prefers the local address when it answers', async () => {
    const spy = vi.fn().mockResolvedValue(okPing)
    vi.stubGlobal('fetch', spy)
    const eff = await resolveEffectiveServer(withLocal)
    expect(eff.baseUrl).toBe('http://192.168.1.9:4533')
    expect(String(spy.mock.calls[0]![0])).toContain('192.168.1.9')
  })

  it('falls back to the primary address when the local one is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect((await resolveEffectiveServer(withLocal)).baseUrl).toBe(config.baseUrl)
  })

  it('falls back when the local address answers but is not a Subsonic server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ hello: 'not subsonic' })),
    )
    expect((await resolveEffectiveServer(withLocal)).baseUrl).toBe(config.baseUrl)
  })

  it('is a no-op without a local address (no network call)', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await resolveEffectiveServer(config)).toBe(config)
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('song normalization (toSong via getRandomSongs)', () => {
  it('normalizes isrc, missing title/artist and non-numeric year', async () => {
    const body = {
      'subsonic-response': {
        status: 'ok',
        randomSongs: {
          song: [
            { id: '1', title: 'T', artist: 'A', year: 1999, isrc: 'USX1' },
            { id: '2', isrc: ['USX2', 'USX3'], year: '1999' }, // year is not a number
          ],
        },
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)))

    const songs = await getRandomSongs(config)
    expect(songs).toHaveLength(2)
    expect(songs[0]!.isrc).toEqual(['USX1']) // string becomes a one-element array
    expect(songs[0]!.year).toBe(1999)
    expect(songs[1]!.isrc).toEqual(['USX2', 'USX3']) // array stays as-is
    expect(songs[1]!.title).toBe('Unknown title')
    expect(songs[1]!.artist).toBe('Unknown artist')
    expect(songs[1]!.year).toBeUndefined()
  })
})
