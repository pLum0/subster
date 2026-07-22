import type { Song } from '../subsonic/client'

/** A song that has been correctly placed on a player's timeline. */
export interface TimelineCard {
  song: Song
  year: number
}

export interface Player {
  id: string
  name: string
  /** Correctly-placed cards, kept sorted ascending by year. */
  timeline: TimelineCard[]
  /** Play tokens (skip / challenge / earn). */
  tokens: number
}

export interface GameSettings {
  /** Cards needed to win (default: 10). */
  winTarget: number
  /** Starting tokens per player. */
  startTokens: number
  /**
   * House rule. When false (original rule), challenging a correct placement
   * always loses the token. When true, a challenger keeps the token if their
   * chosen slot was itself a valid placement.
   */
  challengeGrace: boolean
}

export type Phase =
  | 'placing' // a mystery song is playing; active player is choosing a slot
  | 'challenging' // active player locked in; others may bet a token on a slot
  | 'revealed' // the year is shown and the round has been scored
  | 'gameover'

/** A non-active player's bet that the card belongs at `slot` (on the active timeline). */
export interface Challenge {
  playerIndex: number
  slot: number
}

/** Outcome code for one player at reveal (UI maps these to localized text). */
export type RevealKind =
  | 'active-correct' // placed right, keeps the card
  | 'active-wrong' // placed wrong, no card
  | 'challenge-held' // challenged but the placement was right, lost a token
  | 'challenge-steal' // challenged correctly, steals the card + token back
  | 'challenge-valid' // grace rule: valid slot, keeps the token (no card)
  | 'challenge-wrong' // challenged wrong, lost a token

/** One line of the post-reveal summary. */
export interface RevealLine {
  name: string
  kind: RevealKind
}

export interface CurrentTurn {
  activePlayerIndex: number
  /** The mystery song. Its year is hidden in the UI until reveal. */
  song: Song | null
  /** Slot index (0..timeline.length) the player tentatively chose, or null. */
  pendingSlot: number | null
  /** Token bets placed by other players during the challenging phase. */
  challenges: Challenge[]
  /** Result of the active player's placement (or 'skipped'/'broken'), for UI feedback. */
  lastResult: 'correct' | 'wrong' | 'skipped' | 'broken' | null
  /** Player id who stole the card via a correct challenge, if any. */
  stealerId: string | null
  /** Whether the active player has been awarded the title+artist token this turn. */
  namingAwarded: boolean
  /** Post-reveal summary lines (empty until reveal). */
  reveal: RevealLine[]
}

export interface GameState {
  players: Player[]
  settings: GameSettings
  /** Ordered, pre-built deck (see deck.ts). Drawn front-to-back. */
  deck: Song[]
  deckIndex: number
  phase: Phase
  turn: CurrentTurn
  winnerId: string | null
}

export type GameAction =
  | { type: 'START'; players: Player[]; settings: GameSettings; deck: Song[] }
  | { type: 'PLACE'; slot: number }
  | { type: 'SKIP' } // active player spends a token to discard + redraw
  | { type: 'BROKEN' } // the song's audio failed to play → reveal it free of charge
  | { type: 'OPEN_CHALLENGES' } // active locks placement → challenging phase
  | { type: 'CHALLENGE'; playerIndex: number; slot: number } // bet a token on a slot
  | { type: 'UNCHALLENGE'; playerIndex: number } // take back a bet (refunds the token)
  | { type: 'REVEAL' }
  | { type: 'FORCE_MISS' } // time ran out with no placement → active player misses
  | { type: 'AWARD_NAMING' } // grant the active player the title+artist token
  | { type: 'NEXT_TURN' }
  // Append more cards to a live deck (background deck-building).
  | { type: 'ADD_CARDS'; songs: Song[] }
