import { reducer } from '../game/reducer'
import type { GameAction, GameState } from '../game/types'

/**
 * A transport is the seam between the game UI and the authoritative game state.
 * Pass-and-play uses the local transport below; multi-device (milestone 6) will
 * add a Trystero transport implementing the same interface, where guests send
 * action requests to the host and receive broadcast state.
 */
export interface Transport {
  getState(): GameState
  dispatch(action: GameAction): void
  subscribe(listener: (state: GameState) => void): () => void
  destroy(): void
}

/** Single-device transport: applies the reducer in-process. */
export function createLocalTransport(initial: GameState): Transport {
  let state = initial
  const listeners = new Set<(state: GameState) => void>()

  return {
    getState: () => state,
    dispatch(action) {
      state = reducer(state, action)
      for (const listener of listeners) listener(state)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    destroy() {
      listeners.clear()
    },
  }
}
