import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
    { name: 'subster.setup' },
  ),
)
