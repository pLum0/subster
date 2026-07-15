import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, buildUrl, getRandomSongs, ping } from './client'
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
