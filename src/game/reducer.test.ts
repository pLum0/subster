import { describe, expect, it } from 'vitest'
import { reducer, initialState } from './reducer'
import type { GameSettings, GameState, Player } from './types'
import type { Song } from '../subsonic/client'

function song(id: string, year: number): Song {
  return { id, title: `T${id}`, artist: `A${id}`, year }
}

function players(n: number, tokens = 0): Player[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `P${i}`,
    timeline: [],
    tokens,
  }))
}

const settings: GameSettings = { winTarget: 10, startTokens: 0, challengeGrace: false }

/** deck[0..1] = starting cards for 2 players; deck[2] = first mystery. */
function start(deck: Song[], s: GameSettings = settings, n = 2, tokens = 0): GameState {
  return reducer(initialState(), { type: 'START', players: players(n, tokens), settings: s, deck })
}

describe('START', () => {
  it('deals one starting card per player and draws the first mystery', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995), song('d', 2000)]
    const state = start(deck)
    expect(state.players[0]!.timeline).toEqual([{ song: deck[0], year: 1990 }])
    expect(state.players[1]!.timeline).toEqual([{ song: deck[1], year: 1980 }])
    expect(state.turn.song).toEqual(deck[2])
    expect(state.deckIndex).toBe(3)
    expect(state.phase).toBe('placing')
  })
})

describe('placement', () => {
  it('keeps a correctly placed card and sorts the timeline', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    let state = start(deck)
    state = reducer(state, { type: 'PLACE', slot: 1 }) // after 1990
    state = reducer(state, { type: 'REVEAL' })
    expect(state.turn.lastResult).toBe('correct')
    expect(state.players[0]!.timeline.map((c) => c.year)).toEqual([1990, 1995])
    expect(state.phase).toBe('revealed')
  })

  it('treats an equal year placed adjacent as correct', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1990)]
    let state = start(deck)
    state = reducer(state, { type: 'PLACE', slot: 0 }) // before the 1990 card
    state = reducer(state, { type: 'REVEAL' })
    expect(state.turn.lastResult).toBe('correct')
    expect(state.players[0]!.timeline).toHaveLength(2)
  })

  it('discards an incorrectly placed card', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1970)]
    let state = start(deck)
    state = reducer(state, { type: 'PLACE', slot: 1 }) // after 1990, but 1970 < 1990
    state = reducer(state, { type: 'REVEAL' })
    expect(state.turn.lastResult).toBe('wrong')
    expect(state.players[0]!.timeline).toHaveLength(1)
  })

  it('ignores REVEAL before a slot is chosen', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    const state = reducer(start(deck), { type: 'REVEAL' })
    expect(state.phase).toBe('placing')
    expect(state.turn.lastResult).toBeNull()
  })
})

describe('turns and winning', () => {
  it('advances to the next player and draws a fresh mystery', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995), song('d', 2001)]
    let state = start(deck)
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'NEXT_TURN' })
    expect(state.turn.activePlayerIndex).toBe(1)
    expect(state.turn.song).toEqual(deck[3])
    expect(state.phase).toBe('placing')
  })

  it('ends the game when a player reaches the win target', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    let state = start(deck, { ...settings, winTarget: 2 })
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    // Reveal still shows (last song visible); the win is pending.
    expect(state.phase).toBe('revealed')
    expect(state.winnerId).toBe('p0')
    state = reducer(state, { type: 'NEXT_TURN' })
    expect(state.phase).toBe('gameover')
    expect(state.winnerId).toBe('p0')
  })

  it('ends the game if the deck runs out', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    let state = start(deck) // draws deck[2]; deck now exhausted
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'NEXT_TURN' }) // no deck[3] to draw
    expect(state.phase).toBe('gameover')
    expect(state.winnerId).toBeTruthy()
  })

  it('FORCE_MISS records a miss (no card) for the active player', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    let state = start(deck) // placing, no slot chosen
    state = reducer(state, { type: 'FORCE_MISS' })
    expect(state.phase).toBe('revealed')
    expect(state.turn.lastResult).toBe('wrong')
    expect(state.players[0]!.timeline).toHaveLength(1) // kept only the starting card
    expect(state.turn.reveal[0]!.kind).toBe('active-wrong')
  })

  it('single-player NEXT_TURN keeps the same player and draws a new song', () => {
    const deck = [song('a', 1990), song('b', 1995), song('c', 2000)]
    let state = start(deck, settings, 1) // 1 player: start card a, mystery b
    expect(state.turn.song).toEqual(deck[1])
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'NEXT_TURN' })
    expect(state.turn.activePlayerIndex).toBe(0)
    expect(state.turn.song).toEqual(deck[2])
  })
})

describe('tokens', () => {
  it('SKIP reveals the skipped song, then NEXT_TURN redraws for the same player', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995), song('d', 2000)]
    let state = start(deck, settings, 2, 2)
    state = reducer(state, { type: 'SKIP' })
    expect(state.players[0]!.tokens).toBe(1) // token spent
    expect(state.phase).toBe('revealed') // skipped song shown first
    expect(state.turn.lastResult).toBe('skipped')
    expect(state.turn.song).toEqual(deck[2]) // still the skipped song
    state = reducer(state, { type: 'NEXT_TURN' })
    expect(state.turn.activePlayerIndex).toBe(0) // same player
    expect(state.turn.song).toEqual(deck[3]) // fresh mystery
    expect(state.phase).toBe('placing')
  })

  it('SKIP is a no-op with no tokens', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995), song('d', 2000)]
    const state = start(deck, settings, 2, 0)
    expect(reducer(state, { type: 'SKIP' })).toEqual(state)
  })

  it('a correct challenge steals the card and refunds the token when the active player is wrong', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1970)]
    let state = start(deck, settings, 2, 2)
    state = reducer(state, { type: 'PLACE', slot: 1 }) // p0 places 1970 after 1990 → wrong
    state = reducer(state, { type: 'OPEN_CHALLENGES' })
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 }) // p1 bets before 1990 → correct
    state = reducer(state, { type: 'REVEAL' })
    expect(state.turn.lastResult).toBe('wrong')
    expect(state.turn.stealerId).toBe('p1')
    expect(state.players[1]!.timeline.map((c) => c.year)).toEqual([1970, 1980]) // stolen
    expect(state.players[1]!.tokens).toBe(2) // spent 1, refunded 1
    expect(state.players[0]!.timeline).toHaveLength(1) // p0 kept only its start card
  })

  it('UNCHALLENGE takes back a bet and refunds the token', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1970)]
    let state = start(deck, settings, 2, 2)
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'OPEN_CHALLENGES' })
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 })
    expect(state.players[1]!.tokens).toBe(1)
    state = reducer(state, { type: 'UNCHALLENGE', playerIndex: 1 })
    expect(state.players[1]!.tokens).toBe(2)
    expect(state.turn.challenges).toHaveLength(0)
  })

  it('the reveal summary reports each player outcome', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1970)]
    let state = start(deck, settings, 2, 2)
    state = reducer(state, { type: 'PLACE', slot: 1 }) // p0 wrong
    state = reducer(state, { type: 'OPEN_CHALLENGES' })
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 }) // p1 correct
    state = reducer(state, { type: 'REVEAL' })
    expect(state.turn.reveal).toHaveLength(2)
    expect(state.turn.reveal[0]).toMatchObject({ kind: 'active-wrong' })
    expect(state.turn.reveal[1]).toMatchObject({ kind: 'challenge-steal' })
  })

  it('a challenge against a correct placement loses the token', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    let state = start(deck, settings, 2, 2)
    state = reducer(state, { type: 'PLACE', slot: 1 }) // p0 places 1995 after 1990 → correct
    state = reducer(state, { type: 'OPEN_CHALLENGES' })
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 })
    state = reducer(state, { type: 'REVEAL' })
    expect(state.turn.lastResult).toBe('correct')
    expect(state.turn.stealerId).toBeNull()
    expect(state.players[0]!.timeline).toHaveLength(2) // active kept card
    expect(state.players[1]!.tokens).toBe(1) // bet lost
  })

  it('equal-year: active placement stands; a challenger loses even if their slot was also valid', () => {
    // p0 start card 2000, p1 start card 1980, mystery is also 2000.
    const deck = [song('a', 2000), song('b', 1980), song('c', 2000)]
    let state = start(deck, settings, 2, 2)
    state = reducer(state, { type: 'PLACE', slot: 1 }) // after the 2000 card — valid (equal year)
    state = reducer(state, { type: 'OPEN_CHALLENGES' })
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 }) // before it — also valid in isolation
    state = reducer(state, { type: 'REVEAL' })

    expect(state.turn.lastResult).toBe('correct')
    expect(state.turn.stealerId).toBeNull()
    expect(state.players[0]!.timeline).toHaveLength(2) // active keeps the card
    expect(state.players[1]!.tokens).toBe(1) // challenger's bet token is lost
    expect(state.turn.reveal[1]!.kind).toBe('challenge-held')
  })

  it('challenge grace: a valid bet keeps its token even when the active player was right', () => {
    const deck = [song('a', 2000), song('b', 1980), song('c', 2000)]
    const graceSettings: GameSettings = { winTarget: 10, startTokens: 0, challengeGrace: true }
    let state = start(deck, graceSettings, 2, 2)
    state = reducer(state, { type: 'PLACE', slot: 1 }) // active correct (equal year)
    state = reducer(state, { type: 'OPEN_CHALLENGES' })
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 }) // also a valid slot
    state = reducer(state, { type: 'REVEAL' })

    expect(state.turn.lastResult).toBe('correct')
    expect(state.players[1]!.tokens).toBe(2) // spent 1, refunded by grace
    expect(state.turn.reveal[1]!.kind).toBe('challenge-valid')
  })

  it('AWARD_NAMING grants one capped token, once', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    let state = start(deck, settings, 2, 2)
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'AWARD_NAMING' })
    expect(state.players[0]!.tokens).toBe(3)
    state = reducer(state, { type: 'AWARD_NAMING' }) // second time is a no-op
    expect(state.players[0]!.tokens).toBe(3)
  })

  it('AWARD_NAMING respects the 5-token cap', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    let state = start(deck, settings, 2, 5)
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'AWARD_NAMING' })
    expect(state.players[0]!.tokens).toBe(5)
  })
})

describe('CHALLENGE guards', () => {
  /** Start an n-player game and lock in a placement → phase 'challenging'. */
  function challenging(n: number, tokens: number): GameState {
    const starts = [song('a', 1990), song('b', 1980), song('c', 2000)].slice(0, n)
    const deck = [...starts, song('m', 1970)]
    let state = start(deck, settings, n, tokens)
    state = reducer(state, { type: 'PLACE', slot: 1 }) // active timeline: [1990] → slots 0..1
    return reducer(state, { type: 'OPEN_CHALLENGES' })
  }

  it('rejects a challenger with no tokens', () => {
    const state = challenging(2, 0)
    expect(reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 })).toBe(state)
  })

  it('rejects a challenge by the active player', () => {
    const state = challenging(2, 2)
    expect(reducer(state, { type: 'CHALLENGE', playerIndex: 0, slot: 0 })).toBe(state)
  })

  it('rejects a bet on the active player\'s pending slot', () => {
    const state = challenging(2, 2) // pendingSlot is 1
    expect(reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 1 })).toBe(state)
  })

  it('rejects a duplicate slot by a second challenger', () => {
    let state = challenging(3, 2)
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 })
    expect(state.turn.challenges).toHaveLength(1)
    expect(reducer(state, { type: 'CHALLENGE', playerIndex: 2, slot: 0 })).toBe(state)
  })

  it('rejects a second bet by the same player', () => {
    // Grow p0's timeline to 2 cards so a second free slot exists besides the
    // pending one (otherwise the duplicate-slot guard would fire first).
    const deck = [
      song('a', 1990), // p0 start
      song('b', 1980), // p1 start
      song('c', 1995), // p0: correct at slot 1 → [1990, 1995]
      song('d', 1985), // p1: correct at slot 1
      song('e', 2005), // p0 mystery
    ]
    let state = start(deck, settings, 2, 2)
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'NEXT_TURN' })
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'NEXT_TURN' })
    // p0 active with slots 0..2; pending slot 2 leaves slots 0 and 1 free.
    state = reducer(state, { type: 'PLACE', slot: 2 })
    state = reducer(state, { type: 'OPEN_CHALLENGES' })
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 })
    expect(state.turn.challenges).toHaveLength(1)
    expect(reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 1 })).toBe(state)
  })

  it('rejects out-of-bounds slots', () => {
    const state = challenging(2, 2) // active timeline length 1 → valid slots 0..1
    expect(reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: -1 })).toBe(state)
    expect(reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 2 })).toBe(state)
  })

  it('rejects a CHALLENGE outside the challenging phase', () => {
    const deck = [song('a', 1990), song('b', 1980), song('m', 1970)]
    const state = start(deck, settings, 2, 2) // phase 'placing'
    expect(reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 })).toBe(state)
  })
})

describe('deck exhaustion tie-break', () => {
  it('awards a tie to the earliest player', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1970)]
    let state = start(deck) // mystery c drawn, deck now exhausted
    state = reducer(state, { type: 'PLACE', slot: 1 }) // 1970 after 1990 → wrong
    state = reducer(state, { type: 'REVEAL' })
    expect(state.players[0]!.timeline).toHaveLength(1)
    expect(state.players[1]!.timeline).toHaveLength(1) // equal lengths
    state = reducer(state, { type: 'NEXT_TURN' })
    expect(state.phase).toBe('gameover')
    expect(state.winnerId).toBe('p0')
  })
})

describe('ADD_CARDS', () => {
  it('appends to a running deck and the card is drawn once the deck runs out', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    let state = start(deck) // mystery c drawn, deck exhausted
    state = reducer(state, { type: 'ADD_CARDS', songs: [song('d', 2005)] })
    expect(state.deck).toHaveLength(4)
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'NEXT_TURN' }) // would have been gameover without d
    expect(state.phase).toBe('placing')
    expect(state.turn.song?.id).toBe('d')
  })

  it('filters yearless songs out of the appended cards', () => {
    const deck = [song('a', 1990), song('b', 1980), song('c', 1995)]
    let state = start(deck)
    const noYear: Song = { id: 'ny1', title: 'Tny1', artist: 'Any1' }
    const zeroYear: Song = { id: 'ny2', title: 'Tny2', artist: 'Any2', year: 0 }
    state = reducer(state, { type: 'ADD_CARDS', songs: [noYear, zeroYear, song('ok', 2001)] })
    expect(state.deck).toHaveLength(4) // only 'ok' entered
    expect(state.deck[3]!.id).toBe('ok')
  })
})

describe('START yearless filtering', () => {
  it('drops yearless deck entries before dealing and drawing', () => {
    const noYear: Song = { id: 'ny', title: 'Tny', artist: 'Any' }
    const deck = [song('a', 1990), noYear, song('b', 1980), song('c', 1995)]
    const state = start(deck)
    expect(state.deck).toHaveLength(3) // ny never enters the deck
    expect(state.players[0]!.timeline[0]!.song.id).toBe('a')
    expect(state.players[1]!.timeline[0]!.song.id).toBe('b') // not the yearless entry
    expect(state.turn.song?.id).toBe('c') // ny is not the mystery either
  })
})

describe('multi-challenger steal', () => {
  /**
   * 3 players; p0's second turn has timeline [1990, 1995] and the mystery is a
   * 1990 card, so slots 0 AND 1 are both valid (equal-year rule) while slot 2
   * is wrong. p0 places at 2; p1 and p2 both bet valid slots.
   */
  function play(grace: boolean): GameState {
    const deck = [
      song('a', 1990), // p0 start
      song('b', 1980), // p1 start
      song('c', 2000), // p2 start
      song('d', 1995), // p0: correct at slot 1 → [1990, 1995]
      song('e', 1970), // p1: correct at slot 0 → [1970, 1980]
      song('f', 2010), // p2: correct at slot 1 → [2000, 2010]
      song('g', 1990), // p0 mystery, equal-year card
    ]
    const s: GameSettings = { ...settings, challengeGrace: grace }
    let state = start(deck, s, 3, 2)
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'NEXT_TURN' })
    state = reducer(state, { type: 'PLACE', slot: 0 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'NEXT_TURN' })
    state = reducer(state, { type: 'PLACE', slot: 1 })
    state = reducer(state, { type: 'REVEAL' })
    state = reducer(state, { type: 'NEXT_TURN' })
    state = reducer(state, { type: 'PLACE', slot: 2 }) // 1990 after 1995 → wrong
    state = reducer(state, { type: 'OPEN_CHALLENGES' })
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 1, slot: 0 }) // valid
    state = reducer(state, { type: 'CHALLENGE', playerIndex: 2, slot: 1 }) // also valid
    return reducer(state, { type: 'REVEAL' })
  }

  it('the earliest seat steals; the later valid bet loses its token without grace', () => {
    const state = play(false)
    expect(state.turn.lastResult).toBe('wrong')
    expect(state.turn.stealerId).toBe('p1')
    expect(state.players[1]!.timeline.map((c) => c.year)).toEqual([1970, 1980, 1990])
    expect(state.players[1]!.tokens).toBe(2) // spent 1, refunded on steal
    expect(state.players[2]!.timeline).toHaveLength(2) // no card for the later bet
    expect(state.players[2]!.tokens).toBe(1) // bet token lost
    expect(state.turn.reveal).toContainEqual({ name: 'P1', kind: 'challenge-steal' })
    expect(state.turn.reveal).toContainEqual({ name: 'P2', kind: 'challenge-wrong' })
  })

  it('with challengeGrace the later valid bet keeps its token (still no card)', () => {
    const state = play(true)
    expect(state.turn.stealerId).toBe('p1')
    expect(state.players[2]!.timeline).toHaveLength(2)
    expect(state.players[2]!.tokens).toBe(2) // spent 1, refunded by grace
    expect(state.turn.reveal).toContainEqual({ name: 'P2', kind: 'challenge-valid' })
  })
})
