import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MetadataMode } from '../subsonic/deck'

/**
 * The last-used Game Setup choices, persisted so a new game starts from where
 * you left off (player names, difficulty, playback options, filters). Kept
 * separate from the live game state — this is just remembered UI defaults.
 */
export interface SetupPrefs {
  names: string[]
  winTarget: number
  difficulty: 'hits' | 'balanced' | 'deep'
  challengeGrace: boolean
  trigger: 'countdown' | 'instant'
  clip: 'full' | '30s' | '60s'
  randomStart: boolean
  lockOnEnd: boolean
  yearFrom: string
  yearTo: string
  genre: string
  musicFolderId: string
  /** Non-empty = build the deck from this playlist instead of a library. */
  playlistId: string
  /**
   * Which server `musicFolderId` / `playlistId` / `genre` belong to. Those ids
   * are meaningless on a different server, so they are ignored when the active
   * server has changed rather than silently building an empty deck.
   */
  serverId?: string
  /**
   * How much of the external metadata pipeline to use (see MetadataMode).
   * Defaults to 'full' for library decks, 'offline' when a playlist is picked.
   */
  metadataMode: MetadataMode
}

export const DEFAULT_PREFS: SetupPrefs = {
  names: [],
  winTarget: 10,
  difficulty: 'balanced',
  challengeGrace: false,
  trigger: 'countdown',
  clip: 'full',
  randomStart: false,
  lockOnEnd: false,
  yearFrom: '',
  yearTo: '',
  genre: '',
  musicFolderId: '',
  playlistId: '',
  metadataMode: 'full',
}

/**
 * The saved preferences, with the server-specific ids dropped when they came
 * from a different server.
 */
export function prefsForServer(prefs: SetupPrefs, serverId: string | undefined): SetupPrefs {
  if (prefs.serverId === serverId) return prefs
  return { ...prefs, musicFolderId: '', playlistId: '', genre: '', serverId }
}

interface SetupState {
  prefs: SetupPrefs
  savePrefs: (prefs: SetupPrefs) => void
}

export const useSetupStore = create<SetupState>()(
  persist(
    (set) => ({
      prefs: DEFAULT_PREFS,
      savePrefs: (prefs) => set({ prefs }),
    }),
    {
      name: 'subster.setup',
      version: 1,
      // v0 stored a boolean `onlineMeta`; it only ever meant all-or-nothing,
      // so it maps onto the two outer modes and nobody lands in 'noRanking'
      // without choosing it.
      migrate: (persisted, version) => {
        const state = persisted as SetupState
        if (version >= 1) return state
        const { onlineMeta, ...rest } = (state?.prefs ?? {}) as SetupPrefs & { onlineMeta?: boolean }
        return {
          ...state,
          prefs: { ...DEFAULT_PREFS, ...rest, metadataMode: onlineMeta === false ? 'offline' : 'full' },
        }
      },
    },
  ),
)
