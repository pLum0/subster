import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { yearFromWikidata } from './wikidata'

// The module-level rate limiter (300ms) uses Date.now() + setTimeout, so fake
// timers run for the whole file with one monotonically-advancing clock.
beforeAll(() => vi.useFakeTimers())
afterAll(() => vi.useRealTimers())
afterEach(() => vi.unstubAllGlobals())

async function settled<T>(p: Promise<T>): Promise<T> {
  await vi.advanceTimersByTimeAsync(10_000)
  return p
}

function res(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

/** Route the two-step (search → entities) flow by URL. */
function stubFlow(search: unknown, entities: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(res(String(url).includes('wbsearchentities') ? search : entities)),
    ),
  )
}

describe('yearFromWikidata', () => {
  it('returns the publication year for a title+artist match', async () => {
    stubFlow(
      {
        search: [
          { id: 'Q1', label: 'Vous qui passez sans me voir', description: 'song performed by Jean Sablon' },
        ],
      },
      {
        entities: {
          Q1: {
            claims: {
              P31: [{ mainsnak: { datavalue: { value: { id: 'Q7366' } } } }],
              P577: [{ mainsnak: { datavalue: { value: { time: '+1936-00-00T00:00:00Z' } } } }],
            },
          },
        },
      },
    )
    expect(await settled(yearFromWikidata('Jean Sablon', 'Vous qui passez sans me voir'))).toBe(1936)
  })

  it('rejects a same-title song by a different artist', async () => {
    // Wikidata has "De temps en temps" as a 2007 Grégory Lemarchal single — not
    // Joséphine Baker's — so the artist-in-description check must reject it.
    stubFlow(
      { search: [{ id: 'Q9', label: 'De temps en temps', description: '2007 single by Grégory Lemarchal' }] },
      { entities: {} },
    )
    expect(await settled(yearFromWikidata('Joséphine Baker', 'De temps en temps'))).toBeUndefined()
  })

  it('ignores an entity that is not a song/single/composition', async () => {
    stubFlow(
      { search: [{ id: 'Q2', label: 'Hello', description: 'film by Adele fan' }] },
      { entities: { Q2: { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q11424' } } } }] } } } },
    )
    expect(await settled(yearFromWikidata('Adele', 'Hello'))).toBeUndefined()
  })

  it('does not cache a transient (non-OK) search error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res({}, { ok: false, status: 429 })))
    expect(await settled(yearFromWikidata('X', 'Y'))).toBeUndefined()
    // A healthy retry resolves — proving the 429 was not cached.
    stubFlow(
      { search: [{ id: 'Q3', label: 'Y', description: 'song by X' }] },
      { entities: { Q3: { claims: {
        P31: [{ mainsnak: { datavalue: { value: { id: 'Q134556' } } } }],
        P577: [{ mainsnak: { datavalue: { value: { time: '+1999-00-00T00:00:00Z' } } } }],
      } } } },
    )
    expect(await settled(yearFromWikidata('X', 'Y'))).toBe(1999)
  })
})
