import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MetadataMode } from '../subsonic/deck'

/**
 * The last-used Game Setup choices, persisted so a new game starts from where
 * you left off (player names, difficulty, playback options, filters). Kept
 * separate from the live game state — this is just remembered UI defaults.
 */
/**
 * The choices that only mean something on one particular server. Kept per
 * server id so switching back and forth restores each one's own deck source,
 * rather than blanking it every time.
 *
 * `metadataMode` lives here because picking a playlist auto-selects 'offline':
 * keeping the pair together stops a source from one server arriving with a
 * mode chosen for another.
 */
export interface ServerPrefs {
  genre: string
  musicFolderId: string
  /** Non-empty = build the deck from this playlist instead of a library. */
  playlistId: string
  metadataMode: MetadataMode
}

export const DEFAULT_SERVER_PREFS: ServerPrefs = {
  genre: '',
  musicFolderId: '',
  playlistId: '',
  metadataMode: 'full',
}

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
  /** Deck source per server id — see ServerPrefs. */
  byServer: Record<string, ServerPrefs>
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
  byServer: {},
}

/** What this server last used, or sensible defaults if it is new to us. */
export function serverPrefs(prefs: SetupPrefs, serverId: string | undefined): ServerPrefs {
  return (serverId ? prefs.byServer[serverId] : undefined) ?? DEFAULT_SERVER_PREFS
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
      version: 2,
      migrate: (persisted, version) => {
        const state = persisted as SetupState
        if (version >= 2) return state
        // v0 held a boolean `onlineMeta` (all-or-nothing, so it maps onto the
        // two outer modes); v0 and v1 both kept the deck source at the top
        // level, belonging to whichever server was active at the time.
        const old = (state?.prefs ?? {}) as Partial<SetupPrefs> &
          Partial<ServerPrefs> & { onlineMeta?: boolean; serverId?: string }
        const { onlineMeta, serverId, genre, musicFolderId, playlistId, metadataMode, ...rest } = old
        const source: ServerPrefs = {
          genre: genre ?? '',
          musicFolderId: musicFolderId ?? '',
          playlistId: playlistId ?? '',
          metadataMode: metadataMode ?? (onlineMeta === false ? 'offline' : 'full'),
        }
        return {
          ...state,
          prefs: {
            ...DEFAULT_PREFS,
            ...rest,
            // Without a server id there is no way to tell whose source it was,
            // so it is dropped rather than misattributed.
            byServer: serverId ? { [serverId]: source } : {},
          },
        }
      },
    },
  ),
)
