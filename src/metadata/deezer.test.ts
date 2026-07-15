import { afterEach, describe, expect, it, vi } from 'vitest'
import { normTitle, searchTrack } from './deezer'

// NOTE: the module-level caches (and the 120ms rate limiter) persist across
// tests in this file — every test uses distinct artist/title strings to avoid
// cache crosstalk, and real timers (a few 120ms waits are tolerable).

/** A minimal fetch Response whose .json() resolves to `body`. */
function res(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: '',
    json: () => Promise.resolve(body),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('searchTrack', () => {
  it('does not cache a rate-limited (429) response', async () => {
    // First attempt is rate-limited: must return null WITHOUT caching the miss.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({}, { ok: false, status: 429 })))
    expect(await searchTrack('Artist429', 'Title429')).toBeNull()

    // Same query with a healthy server now finds the track — proving the 429
    // result was not written to the cache.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        if (String(url).includes('/top')) return res({ data: [] })
        return res({
          data: [{ id: 1, rank: 500000, title: 'Title429', artist: { id: 7, name: 'Artist429' } }],
        })
      }),
    )
    expect(await searchTrack('Artist429', 'Title429')).toEqual({ id: 1, rank: 500000 })

    // ...and the successful hit IS cached: no further fetches needed.
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await searchTrack('Artist429', 'Title429')).toEqual({ id: 1, rank: 500000 })
    expect(spy).not.toHaveBeenCalled()
  })

  it('caches a genuine miss (200 with empty data)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({ data: [] })))
    expect(await searchTrack('ArtistMiss', 'TitleMiss')).toBeNull()

    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await searchTrack('ArtistMiss', 'TitleMiss')).toBeNull()
    expect(spy).not.toHaveBeenCalled() // the null came from the cache
  })
})

describe('normTitle', () => {
  it('strips remaster/version/feat suffixes but keeps the core tokens', () => {
    expect(normTitle('Bohemian Rhapsody (Remastered 2015)')).toBe('bohemian rhapsody')
    expect(normTitle('Dancing Queen - Single Version')).toBe('dancing queen')
    expect(normTitle('Umbrella feat. Jay-Z')).toBe('umbrella')
    expect(normTitle('99 Luftballons')).toBe('99 luftballons')
  })
})
