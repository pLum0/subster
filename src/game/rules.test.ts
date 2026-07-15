import { describe, expect, it } from 'vitest'
import { addTokens, insertSorted, isPlacementCorrect, MAX_TOKENS, slotBounds } from './rules'
import type { TimelineCard } from './types'
import type { Song } from '../subsonic/client'

function card(id: string, year: number): TimelineCard {
  const song: Song = { id, title: `T${id}`, artist: `A${id}`, year }
  return { song, year }
}

describe('slotBounds', () => {
  it('is fully open on an empty timeline', () => {
    expect(slotBounds([], 0)).toEqual({ lower: -Infinity, upper: Infinity })
  })

  it('bounds middle and end slots by the neighbouring cards', () => {
    const timeline = [card('a', 1970), card('b', 1980), card('c', 1990)]
    expect(slotBounds(timeline, 0)).toEqual({ lower: -Infinity, upper: 1970 })
    expect(slotBounds(timeline, 1)).toEqual({ lower: 1970, upper: 1980 })
    expect(slotBounds(timeline, 2)).toEqual({ lower: 1980, upper: 1990 })
    expect(slotBounds(timeline, 3)).toEqual({ lower: 1990, upper: Infinity })
  })
})

describe('isPlacementCorrect', () => {
  it('treats bounds as inclusive on both sides (equal-year rule)', () => {
    const timeline = [card('a', 1980), card('b', 1990)]
    expect(isPlacementCorrect(timeline, 0, 1980)).toBe(true) // equal to upper
    expect(isPlacementCorrect(timeline, 1, 1980)).toBe(true) // equal to lower
    expect(isPlacementCorrect(timeline, 1, 1990)).toBe(true) // equal to upper

    // Equal year on BOTH sides of the slot is also correct.
    const twins = [card('x', 1990), card('y', 1990)]
    expect(isPlacementCorrect(twins, 1, 1990)).toBe(true)
  })

  it('rejects a year outside the slot bounds', () => {
    const timeline = [card('a', 1980), card('b', 1990)]
    expect(isPlacementCorrect(timeline, 0, 1985)).toBe(false)
    expect(isPlacementCorrect(timeline, 2, 1985)).toBe(false)
  })
})

describe('insertSorted', () => {
  it('keeps the timeline sorted ascending by year', () => {
    const timeline = [card('a', 1970), card('c', 1990)]
    const next = insertSorted(timeline, card('b', 1980))
    expect(next.map((c) => c.year)).toEqual([1970, 1980, 1990])
    expect(timeline).toHaveLength(2) // input is not mutated
  })

  it('inserts an equal-year card after existing ones of the same year (stable)', () => {
    const timeline = [card('a', 1980), card('b', 1980)]
    const next = insertSorted(timeline, card('c', 1980))
    expect(next.map((c) => c.song.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('addTokens', () => {
  it('clamps at MAX_TOKENS', () => {
    expect(MAX_TOKENS).toBe(5)
    expect(addTokens(5, 1)).toBe(5)
    expect(addTokens(4, 3)).toBe(5)
    expect(addTokens(2, 1)).toBe(3)
  })

  it('clamps at 0 for negative deltas', () => {
    expect(addTokens(0, -1)).toBe(0)
    expect(addTokens(2, -5)).toBe(0)
    expect(addTokens(2, -1)).toBe(1)
  })
})
