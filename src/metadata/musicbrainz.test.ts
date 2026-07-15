import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { looksLive, yearFromRecordingMbid, yearOf } from './musicbrainz'

// The module-level rate limiter (1100ms) uses Date.now() + setTimeout, so fake
// timers are installed for the WHOLE file: the limiter's `last` timestamp lives
// across tests, and a single monotonically-advancing fake clock keeps every
// queued call satisfiable via advanceTimersByTimeAsync.
beforeAll(() => {
  vi.useFakeTimers()
})

afterAll(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Advance fake time far past the 1100ms throttle, then settle the call. */
async function settled<T>(p: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(10_000)
  return p
}

/** A minimal fetch Response whose .json() resolves to `body`. */
function res(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: '',
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('yearFromRecordingMbid', () => {
  it('does not cache a 503 response', async () => {
    // Rate-limited/unavailable: returns the empty value WITHOUT caching it.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({}, { ok: false, status: 503 })))
    expect(await settled(yearFromRecordingMbid('mbid-503'))).toEqual({ live: false })

    // The same MBID with a healthy server resolves the real year — proving the
    // 503 miss was not written to the cache.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        res({
          title: 'Song',
          releases: [{ 'release-group': { 'first-release-date': '1969-03-12' } }],
        }),
      ),
    )
    expect(await settled(yearFromRecordingMbid('mbid-503'))).toEqual({ year: 1969, live: false })
  })

  it('excludes compilation release-groups and takes the earliest clean year', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        res({
          title: 'Song',
          releases: [
            { 'release-group': { 'first-release-date': '1991', 'secondary-types': ['Compilation'] } },
            { 'release-group': { 'first-release-date': '1975-06-01' } },
            { 'release-group': { 'first-release-date': '1969-03-12' } },
          ],
        }),
      ),
    )
    expect(await settled(yearFromRecordingMbid('mbid-comp'))).toEqual({ year: 1969, live: false })

    // A successful lookup IS cached: a second call needs no fetch.
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await settled(yearFromRecordingMbid('mbid-comp'))).toEqual({ year: 1969, live: false })
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('yearOf', () => {
  it('extracts the leading 4-digit year', () => {
    expect(yearOf('1969-03-12')).toBe(1969)
    expect(yearOf('196')).toBeUndefined()
    expect(yearOf(undefined)).toBeUndefined()
    // '0000' matches the 4-digit pattern and parses to 0 (not undefined).
    expect(yearOf('0000')).toBe(0)
  })
})

describe('looksLive', () => {
  it('matches live keywords on word boundaries only', () => {
    expect(looksLive('Live at Wembley')).toBe(true)
    expect(looksLive('Alive')).toBe(false)
    expect(looksLive(undefined)).toBe(false)
  })
})
