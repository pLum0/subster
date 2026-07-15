import { describe, expect, it } from 'vitest'
import {
  buildDeckOrder,
  computeQuotas,
  deckFloor,
  DIFFICULTY,
  isLiveVersion,
  spreadArtists,
  tierIndex,
  type ClassifiedSong,
} from './deck'
import type { Song } from './client'

/** Deterministic PRNG so the weighted draws are reproducible in tests. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function make(id: string, year: number, known: boolean): ClassifiedSong {
  const song: Song = { id, title: id, artist: id, year }
  return { song, decade: Math.floor(year / 10) * 10, known }
}

describe('buildDeckOrder — decade spread', () => {
  it('front-loads a sparse decade above its raw proportion (√-weighting)', () => {
    const items: ClassifiedSong[] = []
    for (let i = 0; i < 100; i++) items.push(make(`crowd${i}`, 2010 + (i % 10), true))
    for (let i = 0; i < 4; i++) items.push(make(`rare${i}`, 1960 + i, true))

    const order = buildDeckOrder(items, 0.75, mulberry32(42))
    expect(order).toHaveLength(104)

    // Overall share of the sparse 1960s decade is 4/104 ≈ 3.8%. √-weighting
    // gives it a constant, higher per-draw chance until it depletes, so its
    // share in the first quarter of the deck must exceed the overall share.
    const firstQuarter = order.slice(0, 26)
    const rareEarly = firstQuarter.filter((s) => s.id.startsWith('rare')).length
    expect(rareEarly / firstQuarter.length).toBeGreaterThan(4 / 104)
  })
})

describe('buildDeckOrder — 75/25 known/rest mix', () => {
  it('deals roughly the requested ratio of known songs', () => {
    const items: ClassifiedSong[] = []
    for (let i = 0; i < 80; i++) items.push(make(`k${i}`, 1990 + (i % 20), true))
    for (let i = 0; i < 80; i++) items.push(make(`r${i}`, 1990 + (i % 20), false))

    const order = buildDeckOrder(items, 0.75, mulberry32(7))
    const first40 = order.slice(0, 40)
    const knownCount = first40.filter((s) => s.id.startsWith('k')).length
    // Target 30/40; allow sampling slack.
    expect(knownCount).toBeGreaterThanOrEqual(25)
    expect(knownCount).toBeLessThanOrEqual(35)
  })

  it('falls back to the rest pool when known music is too thin', () => {
    const items: ClassifiedSong[] = []
    for (let i = 0; i < 5; i++) items.push(make(`k${i}`, 2000 + i, true))
    for (let i = 0; i < 60; i++) items.push(make(`r${i}`, 1980 + (i % 30), false))

    const order = buildDeckOrder(items, 0.75, mulberry32(1))
    expect(order).toHaveLength(65) // every song dealt
    const ids = new Set(order.map((s) => s.id))
    for (let i = 0; i < 5; i++) expect(ids.has(`k${i}`)).toBe(true) // all known included
  })
})

describe('popularity tiers', () => {
  const tiers = DIFFICULTY.balanced // [550k, 380k, 250k]

  it('maps a rank to the right tier and rejects below the floor', () => {
    expect(tierIndex(900_000, tiers)).toBe(0)
    expect(tierIndex(400_000, tiers)).toBe(1)
    expect(tierIndex(300_000, tiers)).toBe(2)
    expect(tierIndex(150_000, tiers)).toBe(-1) // below floor
    expect(deckFloor(tiers)).toBe(250_000)
  })

  it('computes per-tier quotas from the deck target', () => {
    expect(computeQuotas(48, tiers)).toEqual([19, 17, 12]) // 40/35/25
  })
})

describe('isLiveVersion', () => {
  it('flags live/unplugged by title', () => {
    expect(isLiveVersion('Song (Live)')).toBe(true)
    expect(isLiveVersion('Song - Live')).toBe(true)
    expect(isLiveVersion('Song (Live at Wembley)')).toBe(true)
    expect(isLiveVersion('Song (MTV Unplugged)')).toBe(true)
  })

  it('flags live by album even when the title looks studio', () => {
    // The real-world miss: track title has no "live", album is a live record.
    expect(isLiveVersion('Niemals einer Meinung', 'Das 1000. Konzert')).toBe(true)
    expect(isLiveVersion('Some Song', 'MTV Unplugged in New York')).toBe(true)
  })

  it('does not flag studio tracks that merely contain the word live', () => {
    expect(isLiveVersion('Live and Let Die', 'Band on the Run')).toBe(false)
    expect(isLiveVersion('Alive', 'Ten')).toBe(false)
  })
})

describe('spreadArtists', () => {
  const s = (id: string, artist: string): Song => ({ id, title: id, artist, year: 2000 })
  const artists = (list: Song[]) => list.map((x) => x.artist)
  const hasAdjacentDup = (list: Song[]) => list.some((x, i) => i > 0 && x.artist === list[i - 1]?.artist)

  it('separates adjacent same-artist songs when possible', () => {
    const out = spreadArtists([s('1', 'A'), s('2', 'A'), s('3', 'B'), s('4', 'C')])
    expect(hasAdjacentDup(out)).toBe(false)
    expect(out).toHaveLength(4)
  })

  it('guards the seam against the previous batch', () => {
    const out = spreadArtists([s('1', 'A'), s('2', 'B')], 'A')
    expect(out[0]?.artist).toBe('B') // first must differ from prevArtist 'A'
  })

  it('leaves an unavoidable run intact (more of one artist than gaps)', () => {
    const out = spreadArtists([s('1', 'A'), s('2', 'A'), s('3', 'A')])
    expect(artists(out)).toEqual(['A', 'A', 'A'])
  })
})
