import type { GameState, Player } from './types'

export function activePlayer(state: GameState): Player {
  // The reducer keeps activePlayerIndex in [0, players.length).
  return state.players[state.turn.activePlayerIndex] as Player
}

export function winner(state: GameState): Player | null {
  return state.players.find((p) => p.id === state.winnerId) ?? null
}

export function leaderboard(state: GameState): Player[] {
  return [...state.players].sort((a, b) => b.timeline.length - a.timeline.length)
}
