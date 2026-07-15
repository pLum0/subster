import type { GameAction, GameState, Player, RevealLine } from './types'
import { addTokens, hasWon, insertSorted, isPlacementCorrect } from './rules'

/** Deal one starting card to each player from the front of the deck. */
function dealStartingCards(
  players: Player[],
  deck: GameState['deck'],
): { players: Player[]; deckIndex: number } {
  const dealt = players.map((p, i) => {
    const song = deck[i]
    const timeline = song?.year ? [{ song, year: song.year }] : []
    return { ...p, timeline }
  })
  return { players: dealt, deckIndex: players.length }
}

/** Fresh per-turn state (keeps the active player index). */
function freshTurn(activePlayerIndex: number): GameState['turn'] {
  return {
    activePlayerIndex,
    song: null,
    pendingSlot: null,
    challenges: [],
    lastResult: null,
    stealerId: null,
    namingAwarded: false,
    reveal: [],
  }
}

/** Draw the next mystery card for the active player, resetting the turn. */
function drawNext(state: GameState): GameState {
  const song = state.deck[state.deckIndex]
  if (!song) {
    // Deck exhausted: end the game, most cards wins (ties → earliest player).
    const winner = state.players.reduce<Player | null>(
      (best, p) => (!best || p.timeline.length > best.timeline.length ? p : best),
      null,
    )
    return { ...state, phase: 'gameover', winnerId: winner?.id ?? null }
  }
  return {
    ...state,
    deckIndex: state.deckIndex + 1,
    phase: 'placing',
    turn: { ...freshTurn(state.turn.activePlayerIndex), song },
  }
}

export function initialState(): GameState {
  return {
    players: [],
    settings: { winTarget: 10, startTokens: 0, challengeGrace: false },
    deck: [],
    deckIndex: 0,
    phase: 'gameover',
    turn: freshTurn(0),
    winnerId: null,
  }
}

export function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START': {
      // A yearless song can never be placed on a timeline (REVEAL would be a
      // dead end) — enforce the invariant here instead of trusting callers.
      const deck = action.deck.filter((s) => (s.year ?? 0) > 0)
      const { players: dealt, deckIndex } = dealStartingCards(action.players, deck)
      const base: GameState = {
        players: dealt,
        settings: action.settings,
        deck,
        deckIndex,
        phase: 'placing',
        turn: freshTurn(0),
        winnerId: null,
      }
      return drawNext(base)
    }

    case 'SKIP': {
      // Spend a token to discard the current song and draw a new one, same turn.
      if (state.phase !== 'placing') return state
      const idx = state.turn.activePlayerIndex
      if ((state.players[idx]?.tokens ?? 0) < 1) return state
      const players = state.players.map((p, i) =>
        i === idx ? { ...p, tokens: p.tokens - 1 } : p,
      )
      return drawNext({ ...state, players })
    }

    case 'PLACE': {
      if (state.phase !== 'placing') return state
      const active = state.players[state.turn.activePlayerIndex]
      if (!active || action.slot < 0 || action.slot > active.timeline.length) return state
      return { ...state, turn: { ...state.turn, pendingSlot: action.slot } }
    }

    case 'OPEN_CHALLENGES': {
      if (state.phase !== 'placing' || state.turn.pendingSlot == null) return state
      return { ...state, phase: 'challenging' }
    }

    case 'CHALLENGE': {
      if (state.phase !== 'challenging') return state
      const { playerIndex, slot } = action
      const active = state.players[state.turn.activePlayerIndex]
      const challenger = state.players[playerIndex]
      if (
        !active ||
        playerIndex === state.turn.activePlayerIndex ||
        !challenger ||
        challenger.tokens < 1 ||
        slot < 0 ||
        slot > active.timeline.length ||
        slot === state.turn.pendingSlot || // can't bet the active player's own slot
        state.turn.challenges.some((c) => c.slot === slot) || // one token per location
        state.turn.challenges.some((c) => c.playerIndex === playerIndex) // one bet per player
      ) {
        return state
      }
      const players = state.players.map((p, i) =>
        i === playerIndex ? { ...p, tokens: p.tokens - 1 } : p,
      )
      return {
        ...state,
        players,
        turn: { ...state.turn, challenges: [...state.turn.challenges, { playerIndex, slot }] },
      }
    }

    case 'UNCHALLENGE': {
      // Take back a bet before reveal; refund the token.
      if (state.phase !== 'challenging') return state
      const { playerIndex } = action
      if (!state.turn.challenges.some((c) => c.playerIndex === playerIndex)) return state
      const players = state.players.map((p, i) =>
        i === playerIndex ? { ...p, tokens: addTokens(p.tokens, 1) } : p,
      )
      return {
        ...state,
        players,
        turn: {
          ...state.turn,
          challenges: state.turn.challenges.filter((c) => c.playerIndex !== playerIndex),
        },
      }
    }

    case 'REVEAL': {
      const { song, pendingSlot, challenges } = state.turn
      if ((state.phase !== 'placing' && state.phase !== 'challenging') || pendingSlot == null || !song?.year) {
        return state
      }
      const year = song.year
      const idx = state.turn.activePlayerIndex
      const active = state.players[idx]
      if (!active) return state
      const activeTimeline = active.timeline
      const activeCorrect = isPlacementCorrect(activeTimeline, pendingSlot, year)

      const players = state.players.map((p) => ({ ...p }))
      // Same index into the fresh copy — cannot be missing.
      const activeCopy = players[idx] as Player
      let winnerId: string | null = null
      let stealerId: string | null = null
      const reveal: RevealLine[] = []

      if (activeCorrect) {
        activeCopy.timeline = insertSorted(activeTimeline, { song, year })
        reveal.push({ name: active.name, kind: 'active-correct' })
        if (hasWon(activeCopy, state.settings.winTarget)) winnerId = activeCopy.id
      } else {
        reveal.push({ name: active.name, kind: 'active-wrong' })
        // First correct challenger (by seat) steals the card and gets the token back.
        const winner = [...challenges]
          .sort((a, b) => a.playerIndex - b.playerIndex)
          .find((c) => isPlacementCorrect(activeTimeline, c.slot, year))
        const stealer = winner ? players[winner.playerIndex] : undefined
        if (stealer) {
          stealer.timeline = insertSorted(stealer.timeline, { song, year })
          stealer.tokens = addTokens(stealer.tokens, 1)
          stealerId = stealer.id
          if (hasWon(stealer, state.settings.winTarget)) winnerId = stealer.id
        }
      }

      // Per-challenger outcome lines (and grace-rule refunds).
      for (const c of challenges) {
        const p = players[c.playerIndex]
        if (!p) continue
        const validSlot = isPlacementCorrect(activeTimeline, c.slot, year)
        if (p.id === stealerId) {
          reveal.push({ name: p.name, kind: 'challenge-steal' }) // token already refunded above
        } else if (state.settings.challengeGrace && validSlot) {
          p.tokens = addTokens(p.tokens, 1) // grace: valid bet keeps its token
          reveal.push({ name: p.name, kind: 'challenge-valid' })
        } else if (activeCorrect) {
          reveal.push({ name: p.name, kind: 'challenge-held' })
        } else {
          reveal.push({ name: p.name, kind: 'challenge-wrong' })
        }
      }

      // Always land on the reveal screen (even on a winning card) so the last
      // song is shown; NEXT_TURN promotes a pending winner to 'gameover'.
      return {
        ...state,
        players,
        phase: 'revealed',
        winnerId,
        turn: { ...state.turn, lastResult: activeCorrect ? 'correct' : 'wrong', stealerId, reveal },
      }
    }

    case 'FORCE_MISS': {
      // Timed placement ran out with nothing chosen — the active player misses.
      if (state.phase !== 'placing') return state
      const active = state.players[state.turn.activePlayerIndex]
      if (!active) return state
      return {
        ...state,
        phase: 'revealed',
        turn: {
          ...state.turn,
          lastResult: 'wrong',
          reveal: [{ name: active.name, kind: 'active-wrong' }],
        },
      }
    }

    case 'AWARD_NAMING': {
      // Active player named title + artist → +1 token (independent of placement).
      if (state.phase !== 'revealed' || state.turn.namingAwarded) return state
      const idx = state.turn.activePlayerIndex
      const players = state.players.map((p, i) =>
        i === idx ? { ...p, tokens: addTokens(p.tokens, 1) } : p,
      )
      return { ...state, players, turn: { ...state.turn, namingAwarded: true } }
    }

    case 'ADD_CARDS':
      // Same invariant as START: only yeared songs may enter the deck.
      return { ...state, deck: [...state.deck, ...action.songs.filter((s) => (s.year ?? 0) > 0)] }

    case 'NEXT_TURN': {
      if (state.phase === 'gameover') return state
      // A win was decided on the just-revealed card: end the game now.
      if (state.winnerId) return { ...state, phase: 'gameover' }
      const activePlayerIndex = (state.turn.activePlayerIndex + 1) % state.players.length
      return drawNext({ ...state, turn: { ...state.turn, activePlayerIndex } })
    }

    default:
      return state
  }
}
