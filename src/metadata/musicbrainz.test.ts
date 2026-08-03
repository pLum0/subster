import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  earliestRecordingYear,
  looksLive,
  recordingMbidFromAlbum,
  recordingMbidFromText,
  yearFromRecordingMbid,
  yearOf,
} from './musicbrainz'

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

describe('rate-limit retry', () => {
  it('retries a 503 and keeps the answer it finally gets', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res({}, { ok: false, status: 503 }))
      .mockResolvedValueOnce(
        res({ title: 'Song', releases: [{ 'release-group': { 'first-release-date': '1977' } }] }),
      )
    vi.stubGlobal('fetch', fetchMock)
    expect(await settled(yearFromRecordingMbid('mbid-retry'))).toEqual({ year: 1977, live: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after two retries rather than looping', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({}, { ok: false, status: 503 }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await settled(yearFromRecordingMbid('mbid-retry-fail'))).toEqual({ live: false })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

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

  it("prefers the release's own date over its group's earliest", async () => {
    // Daft Punk's "Revolution 909": the single's release-group carries
    // first-release-date 1996 because its earliest member is a promo pressing
    // we exclude. The official releases are 1997 and 1998, so 1997 is right.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        res({
          title: 'Song',
          releases: [
            { date: '1998', status: 'Official', 'release-group': { 'first-release-date': '1996' } },
            { date: '1997', status: 'Official', 'release-group': { 'first-release-date': '1997' } },
            { date: '1996', status: 'Promotion', 'release-group': { 'first-release-date': '1996' } },
          ],
        }),
      ),
    )
    expect(await settled(yearFromRecordingMbid('mbid-promo-group'))).toEqual({ year: 1997, live: false })
  })

  it('falls back to the group date when the release itself is undated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        res({
          title: 'Song',
          releases: [{ status: 'Official', 'release-group': { 'first-release-date': '1969-03-12' } }],
        }),
      ),
    )
    expect(await settled(yearFromRecordingMbid('mbid-undated'))).toEqual({ year: 1969, live: false })
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

describe('earliestRecordingYear', () => {
  it('takes the earliest non-live first-release-date, ignoring a later comp/mix tag', async () => {
    // Mirrors "Smells Like Teen Spirit (Butch Vig Mix)": a later mix recording
    // (2004) plus the original studio recordings (1991); a live take is ignored.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        res({
          recordings: [
            { score: 100, title: 'Smells Like Teen Spirit (Butch Vig Mix)', 'artist-credit': [{ name: 'Nirvana' }],
              releases: [{ date: '2004', status: 'Official', 'release-group': {} }] },
            { score: 100, title: 'Smells Like Teen Spirit', 'artist-credit': [{ name: 'Nirvana' }],
              releases: [{ date: '1991-09-10', status: 'Official', 'release-group': {} }] },
            { score: 100, title: 'Smells Like Teen Spirit (live)', 'artist-credit': [{ name: 'Nirvana' }],
              releases: [{ date: '1991-08-01', status: 'Official', 'release-group': { 'secondary-types': ['Live'] } }] },
          ],
        }),
      ),
    )
    // Query the specific mix; qualifier-stripping still matches the 1991 originals.
    expect(await settled(earliestRecordingYear('Nirvana', 'Smells Like Teen Spirit (Butch Vig Mix)'))).toBe(1991)
  })

  it('ignores bootlegs, promos and demos — a single before the album still counts', async () => {
    // The real "Don't Tread on Me" data: a 1990 bootleg of a concert alongside
    // the August 1991 album. Answering 1990 would date the card a year early.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        res({
          recordings: [
            {
              score: 100,
              title: 'Song',
              'artist-credit': [{ name: 'Band' }],
              releases: [
                { date: '1990', status: 'Bootleg', 'release-group': { 'secondary-types': ['Live'] } },
                { date: '1990-06', status: 'Promotion', 'release-group': {} },
                { date: '1989', status: 'Official', 'release-group': { 'secondary-types': ['Demo'] } },
                { date: '1991-03', status: 'Official', 'release-group': {} }, // the single
                { date: '1991-08-12', status: 'Official', 'release-group': {} }, // the album
              ],
            },
          ],
        }),
      ),
    )
    expect(await settled(earliestRecordingYear('Band', 'Song'))).toBe(1991)
  })

  it('counts a release whose status MusicBrainz does not record', async () => {
    // Unknown status is common and usually legitimate; dropping it would cost
    // more coverage than the oddities it would catch.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        res({
          recordings: [
            {
              score: 100,
              title: 'Song',
              'artist-credit': [{ name: 'Other Band' }],
              releases: [{ date: '1977', 'release-group': {} }],
            },
          ],
        }),
      ),
    )
    expect(await settled(earliestRecordingYear('Other Band', 'Song'))).toBe(1977)
  })

  it('requires the artist to be credited and the base title to match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        res({
          recordings: [
            { score: 100, title: 'Smells Like Teen Spirit', 'artist-credit': [{ name: 'Some Cover Band' }],
              releases: [{ date: '1979', status: 'Official', 'release-group': {} }] },
            { score: 100, title: 'A Totally Different Song', 'artist-credit': [{ name: 'Nirvana' }],
              releases: [{ date: '1980', status: 'Official', 'release-group': {} }] },
          ],
        }),
      ),
    )
    expect(await settled(earliestRecordingYear('Nirvana', 'Smells Like Teen Spirit'))).toBeUndefined()
  })
})

describe('recordingMbidFromAlbum', () => {
  /** Fetch stub that answers by URL fragment, recording every URL it saw. */
  function stub(routes: Array<[RegExp, unknown]>) {
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        urls.push(url)
        const hit = routes.find(([re]) => re.test(url))
        return Promise.resolve(res(hit ? hit[1] : {}))
      }),
    )
    return urls
  }

  it('reads the recording id off the release tracklist', async () => {
    // The real case from issue #13: a compilation rip whose tracklist still
    // names the original 1973 recording.
    const urls = stub([
      [/\/release\?query/, { releases: [{ id: 'rel-1', score: 100 }] }],
      [
        /\/release\/rel-1/,
        {
          media: [
            { tracks: [{ title: 'The Song Remains the Same', recording: { id: 'rec-other' } }] },
            { tracks: [{ title: 'No Quarter', recording: { id: 'rec-1973' } }] },
          ],
        },
      ],
    ])
    expect(await settled(recordingMbidFromAlbum('Led Zeppelin', 'No Quarter', 'Mothership CD2'))).toBe(
      'rec-1973',
    )
    // The disc marker never reaches MusicBrainz — no release is called "CD2".
    expect(urls[0]).toContain(encodeURIComponent('release:"Mothership"'))
  })

  it('caches a miss so a second call makes no request', async () => {
    stub([[/\/release\?query/, { releases: [] }]])
    expect(await settled(recordingMbidFromAlbum('A', 'B', 'Album X'))).toBeUndefined()

    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    expect(await settled(recordingMbidFromAlbum('A', 'B', 'Album X'))).toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not cache a rate-limited release search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({}, { ok: false, status: 503 })))
    expect(await settled(recordingMbidFromAlbum('A', 'B', 'Album 503'))).toBeUndefined()

    stub([
      [/\/release\?query/, { releases: [{ id: 'rel-9', score: 100 }] }],
      [/\/release\/rel-9/, { media: [{ tracks: [{ title: 'B', recording: { id: 'rec-9' } }] }] }],
    ])
    expect(await settled(recordingMbidFromAlbum('A', 'B', 'Album 503'))).toBe('rec-9')
  })
})

describe('recordingMbidFromText', () => {
  it('constrains the query to the album when one is given, and caches it apart', async () => {
    const seen: string[] = []
    const reply = (id: string) =>
      vi.fn((url: string) => {
        seen.push(url)
        return Promise.resolve(
          res({ recordings: [{ id, score: 100, title: 'Song', 'artist-credit': [{ name: 'Artist' }] }] }),
        )
      })

    vi.stubGlobal('fetch', reply('rec-on-album'))
    expect(await settled(recordingMbidFromText('Artist', 'Song', 'The Album (Deluxe Edition)'))).toBe(
      'rec-on-album',
    )
    expect(seen[0]).toContain(encodeURIComponent('AND release:"The Album"'))

    // The album-less form is a different question, so it is a different cache
    // entry and hits the network again.
    vi.stubGlobal('fetch', reply('rec-anywhere'))
    expect(await settled(recordingMbidFromText('Artist', 'Song'))).toBe('rec-anywhere')
    expect(seen[1]).not.toContain('release:')
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
