import { create } from 'zustand'
import { initialState } from '../game/reducer'
import type { GameSettings, GameState, Player } from '../game/types'
import { createLocalTransport, type Transport } from '../net/local'
import {
  buildDeckOrder,
  computeQuotas,
  CURATED_RANK,
  deckFloor,
  DIFFICULTY,
  fetchCandidates,
  shuffle,
  spreadArtists,
  tierIndex,
  type ClassifiedSong,
  type DeckOptions,
} from '../subsonic/deck'
import { searchTrack } from '../metadata'
import { isCurated } from '../metadata/curated'
import { findCuratedSongs } from '../metadata/curatedFetch'
import { getPlaylistSongs, streamUrl, type Song } from '../subsonic/client'
import { cardMaker } from '../subsonic/cards'
import { audioPlayer } from '../audio/player'
import { getEffectiveServer } from './configStore'

/** How the mystery song is presented each turn. */
export interface PlaybackSettings {
  trigger: 'countdown' | 'instant'
  clip: 'full' | '30s' | '60s'
  randomStart: boolean
  /** Lock the active player's placement when the clip ends (with a 5s warning). */
  lockOnEnd: boolean
}

/** Clip length in seconds, or null for the full song. */
function clipLength(mode: PlaybackSettings['clip']): number | null {
  return mode === '30s' ? 30 : mode === '60s' ? 60 : null
}

const DEFAULT_PLAYBACK: PlaybackSettings = {
  trigger: 'countdown',
  clip: 'full',
  randomStart: false,
  lockOnEnd: false,
}

// The transport is the authoritative state holder; kept outside zustand.
let transport: Transport | null = null
let producerToken = 0
// Remembered for "rematch".
let lastDeck: DeckOptions = {}
let lastNames: string[] = []
let lastSettings: GameSettings = { winTarget: 10, startTokens: 0, challengeGrace: false }
let playback: PlaybackSettings = DEFAULT_PLAYBACK
let countdownTimer: ReturnType<typeof setInterval> | null = null

const BG_BATCH = 6

export interface StartGameOptions {
  playerNames: string[]
  settings: GameSettings
  deck: DeckOptions
  playback: PlaybackSettings
}

interface GameStore {
  game: GameState
  status: 'idle' | 'building' | 'ready' | 'error'
  dealt: number
  error: string | null
  /** Countdown value (3→1) before the song starts, or null. */
  countdown: number | null
  /** Last-5s placement countdown (lock-on-end mode), or null. */
  placeCountdown: number | null
  /** True once a clip has finished — playback is spent for this turn. */
  clipEnded: boolean

  startGame: (opts: StartGameOptions) => Promise<void>
  place: (slot: number) => void
  skip: () => void
  openChallenges: () => void
  challenge: (playerIndex: number, slot: number) => void
  unchallenge: (playerIndex: number) => void
  reveal: () => void
  awardNaming: () => void
  nextTurn: () => void
  toggleAudio: () => void
  restart: () => Promise<void>
  quit: () => void
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

/** Where to start the song (seconds), honouring the random-start option. */
function startOffset(song: Song): number {
  const dur = song.duration ?? 0
  if (!playback.randomStart || dur <= 8) return 0
  const clip = clipLength(playback.clip) ?? 0
  const maxStart = clip ? Math.max(0, dur - clip - 1) : Math.max(0, Math.floor(dur * 0.5))
  return Math.floor(Math.random() * maxStart)
}

export const useGameStore = create<GameStore>((set, get) => {
  const clearCountdown = () => {
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = null
  }

  // When the clip runs out in lock-on-end mode: commit the placement, or miss.
  const lockPlacement = () => {
    const g = get().game
    if (g.phase !== 'placing') return
    if (g.turn.pendingSlot != null) {
      const canChallenge =
        g.players.length > 1 &&
        g.players.some((p, i) => i !== g.turn.activePlayerIndex && p.tokens > 0)
      if (canChallenge) {
        transport?.dispatch({ type: 'OPEN_CHALLENGES' })
      } else {
        audioPlayer.pause()
        transport?.dispatch({ type: 'REVEAL' })
      }
    } else {
      audioPlayer.pause()
      transport?.dispatch({ type: 'FORCE_MISS' })
    }
  }

  const playSong = (song: Song) => {
    const server = getEffectiveServer()
    if (!server) return
    const at = startOffset(song)
    // Fade in on a mid-song (random) start so it doesn't jump in abruptly.
    void audioPlayer.play(streamUrl(server, song.id), at, { fadeInSeconds: at > 0 ? 1.5 : 0 })
    const len = clipLength(playback.clip)
    // Watch a clip always; watch a full song only to lock its placement on end.
    if (len == null && !playback.lockOnEnd) return
    audioPlayer.watch({
      startAt: at,
      clipSeconds: len,
      fadeSeconds: 3,
      onTick: (remaining) => {
        if (!playback.lockOnEnd) return
        const c = Math.ceil(remaining)
        set({ placeCountdown: c <= 5 ? c : null })
      },
      onEnd: () => {
        set({ clipEnded: true, placeCountdown: null })
        if (playback.lockOnEnd) lockPlacement()
      },
    })
  }

  // Present the current mystery song: countdown then play, or play instantly.
  const beginTurn = () => {
    clearCountdown()
    set({ clipEnded: false, countdown: null, placeCountdown: null })
    const song = get().game.turn.song
    if (!song) return
    if (playback.trigger === 'countdown') {
      // If a song is still playing (e.g. after a skip), fade it out under the countdown.
      if (audioPlayer.playing) audioPlayer.fadeOut(2.6)
      set({ countdown: 3 })
      countdownTimer = setInterval(() => {
        const c = get().countdown
        if (c && c > 1) {
          set({ countdown: c - 1 })
        } else {
          clearCountdown()
          set({ countdown: null })
          playSong(song)
        }
      }, 1000)
    } else {
      playSong(song)
    }
  }

  return {
    game: initialState(),
    status: 'idle',
    dealt: 0,
    error: null,
    countdown: null,
    placeCountdown: null,
    clipEnded: false,

    async startGame({ playerNames, settings, deck, playback: pb }) {
      const server = getEffectiveServer()
      if (!server) {
        set({ status: 'error', error: 'No server configured.' })
        return
      }
      lastDeck = deck
      lastNames = playerNames
      lastSettings = settings
      playback = pb

      const myToken = ++producerToken
      set({ status: 'building', dealt: 0, error: null })

      const rng = Math.random
      // With online metadata off, only the user's own server may be contacted:
      // no Deezer ranking (curated-canon membership is the offline "known"
      // signal instead — no rank floor/tiers), no MusicBrainz/Wikidata years.
      const online = deck.onlineMeta !== false
      const difficulty = deck.difficulty ?? 'balanced'
      const tiers = DIFFICULTY[difficulty]
      const floor = deckFloor(tiers)
      // Don't boost the famous-songs canon in Rarities mode — keep it obscure.
      const boostCurated = difficulty !== 'deep'
      let target = deck.targetSize ?? clamp(Math.round(playerNames.length * settings.winTarget * 1.6) + 4, 40, 90)
      const quotas = computeQuotas(target, tiers)

      // Only the starting pool gates startup — it's one fast call. The canon
      // lookup (many searches, slow on a cold cache) must NOT block dealing, so
      // it runs as a separate background producer that streams its cards in.
      let pool: Song[]
      try {
        if (deck.playlistId) {
          // A playlist is already hand-curated: use it whole, just shuffled.
          pool = shuffle(await getPlaylistSongs(server, deck.playlistId), rng)
          target = Math.min(target, pool.length)
        } else {
          pool = shuffle(
            await fetchCandidates(server, {
              size: clamp(Math.round(target * 3.5), 160, 300),
              musicFolderId: deck.musicFolderId,
              genre: deck.genre,
            }),
            rng,
          )
        }
      } catch (e) {
        set({ status: 'error', error: (e as Error).message })
        return
      }

      const makeCard = cardMaker(deck)

      const minToStart = playerNames.length + 1
      let started = false
      let deckCount = 0
      const initial: Song[] = []
      let batch: Song[] = []
      // Artist of the last card dealt so far — so batches don't repeat an
      // artist across the seam (no two same-artist songs back to back).
      let lastArtist: string | undefined
      let signalStart: () => void = () => {}
      const startSignal = new Promise<void>((r) => (signalStart = r))

      const flushBatch = () => {
        if (!batch.length || producerToken !== myToken) return
        const classified: ClassifiedSong[] = batch.map((s) => ({
          song: s,
          decade: Math.floor((s.year as number) / 10) * 10,
          known: true,
        }))
        const ordered = spreadArtists(buildDeckOrder(classified, 1, rng), lastArtist)
        batch = []
        if (ordered.length) lastArtist = ordered[ordered.length - 1]?.artist
        transport?.dispatch({ type: 'ADD_CARDS', songs: ordered })
      }

      const emittedIds = new Set<string>()
      const emit = (card: Song) => {
        if (emittedIds.has(card.id)) return // random + canon producers can overlap
        emittedIds.add(card.id)
        deckCount++
        if (!started) {
          initial.push(card)
          set({ dealt: initial.length })
          if (initial.length >= minToStart) signalStart()
        } else {
          batch.push(card)
          if (batch.length >= BG_BATCH) flushBatch()
        }
      }

      const overflow: Array<{ song: Song; deezerId?: number }> = []
      const produce = async () => {
        for (const song of pool) {
          if (producerToken !== myToken || deckCount >= target) break
          if (!online) {
            // Offline tier: no Deezer ranking, no floor/tiers — every song in
            // the pool becomes a card (file-tag year; yearless ones drop).
            const card = await makeCard(song)
            if (card) emit(card)
            continue
          }
          // A canon song is a top hit even if Deezer under-rates it (older/
          // regional) or has no match — skip the Deezer lookup entirely.
          const curated = boostCurated && isCurated(song.artist, song.title)
          const hit = curated ? null : await searchTrack(song.artist, song.title)
          const rank = curated ? CURATED_RANK : hit?.rank ?? 0
          if (rank < floor) continue
          const ti = tierIndex(rank, tiers)
          if (ti >= 0 && (quotas[ti] ?? 0) > 0) {
            const card = await makeCard(song, hit?.id)
            if (card) {
              quotas[ti]!--
              emit(card)
            }
          } else {
            overflow.push({ song, deezerId: hit?.id })
          }
        }
        for (const o of overflow) {
          if (producerToken !== myToken || deckCount >= target) break
          const card = await makeCard(o.song, o.deezerId)
          if (card) emit(card)
        }
        flushBatch()
      }

      // Background: locate famous-canon songs in the library and stream them in
      // as they're found (bundled canon + same-server search — works offline
      // too). Never gates startup; on a warm cache it's near-instant. Skipped
      // for playlists: it would pull songs from outside the chosen playlist.
      const produceCurated = async () => {
        if (!boostCurated || deck.playlistId) return
        let curatedSongs: Song[] = []
        try {
          curatedSongs = await findCuratedSongs(server, {
            musicFolderId: deck.musicFolderId,
            want: target,
            maxSearches: 120,
          })
        } catch {
          return
        }
        for (const song of curatedSongs) {
          if (producerToken !== myToken || deckCount >= target) break
          const card = await makeCard(song)
          if (card) emit(card)
        }
        flushBatch()
      }

      Promise.allSettled([produce(), produceCurated()]).finally(() => signalStart())
      await startSignal

      if (producerToken !== myToken) return
      if (initial.length < minToStart) {
        producerToken++
        set({
          status: 'error',
          error: `Only ${initial.length} usable songs found. Try another library or an easier difficulty.`,
        })
        return
      }

      const players: Player[] = playerNames.map((name, i) => ({
        id: `p${i}`,
        name: name.trim() || `Player ${i + 1}`,
        timeline: [],
        tokens: settings.startTokens,
      }))

      started = true
      const deckStart = spreadArtists([...initial])
      lastArtist = deckStart[deckStart.length - 1]?.artist

      transport?.destroy()
      transport = createLocalTransport(initialState())
      transport.subscribe((game) => set({ game }))
      transport.dispatch({ type: 'START', players, settings, deck: deckStart })

      set({ status: 'ready' })
      beginTurn()
      flushBatch()
    },

    place(slot) {
      transport?.dispatch({ type: 'PLACE', slot })
    },

    skip() {
      // Reveal the skipped song (keep it playing, like a normal reveal); the
      // next song is drawn on NEXT_TURN.
      clearCountdown()
      set({ countdown: null, placeCountdown: null })
      audioPlayer.unwatch()
      transport?.dispatch({ type: 'SKIP' })
    },

    openChallenges() {
      transport?.dispatch({ type: 'OPEN_CHALLENGES' })
    },

    challenge(playerIndex, slot) {
      transport?.dispatch({ type: 'CHALLENGE', playerIndex, slot })
    },

    unchallenge(playerIndex) {
      transport?.dispatch({ type: 'UNCHALLENGE', playerIndex })
    },

    reveal() {
      clearCountdown()
      set({ countdown: null, placeCountdown: null })
      // Keep the song playing through the reveal (until "Next player"); just
      // stop the clip/lock timer so no timeout kicks in.
      audioPlayer.unwatch()
      transport?.dispatch({ type: 'REVEAL' })
    },

    awardNaming() {
      transport?.dispatch({ type: 'AWARD_NAMING' })
    },

    nextTurn() {
      transport?.dispatch({ type: 'NEXT_TURN' })
      if (get().game.phase === 'gameover') {
        clearCountdown()
        audioPlayer.stop()
      } else {
        beginTurn()
      }
    },

    // Manual play/pause on the mystery card (disabled once a clip is spent).
    toggleAudio() {
      if (get().countdown != null || get().clipEnded) return
      if (audioPlayer.playing) audioPlayer.pause()
      else audioPlayer.resume()
    },

    async restart() {
      await get().startGame({
        playerNames: lastNames,
        settings: lastSettings,
        deck: lastDeck,
        playback,
      })
    },

    quit() {
      producerToken++
      clearCountdown()
      audioPlayer.stop()
      transport?.destroy()
      transport = null
      set({
        game: initialState(),
        status: 'idle',
        dealt: 0,
        error: null,
        countdown: null,
        placeCountdown: null,
        clipEnded: false,
      })
    },
  }
})
