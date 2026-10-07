import { create } from 'zustand'
import { initialState } from '../game/reducer'
import type { GameSettings, GameState, Player } from '../game/types'
import { createLocalTransport, type Transport } from '../net/local'
import {
  artistLimit,
  artistOf,
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
  type MetadataMode,
} from '../subsonic/deck'
import { searchTrack } from '../metadata'
import { isCurated } from '../metadata/curated'
import { findCuratedSongs } from '../metadata/curatedFetch'
import {
  ApiError,
  diagnoseStreamFailure,
  getPlaylistSongs,
  mainArtist,
  streamUrl,
  type Song,
} from '../subsonic/client'
import { cardMaker } from '../subsonic/cards'
import { buildMatcher, exclusionId, type Exclusion } from '../subsonic/exclusions'
import { useExclusionStore } from './exclusionStore'
import { audioPlayer } from '../audio/player'
import {
  demoteIfLanUnreachable,
  getEffectiveServer,
  recheckAddress,
  type ServerConfig,
} from './configStore'
import { getT } from '../i18n'

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

// The exclusion list as a predicate, rebuilt only when the list changes. It is
// consulted for every card rather than once per game, so a song excluded
// mid-game is caught even if a producer had already fetched it.
let matcherFor: Exclusion[] | null = null
let matcher: (song: Song) => boolean = () => false
function isExcluded(song: Song): boolean {
  const items = useExclusionStore.getState().items
  if (items !== matcherFor) {
    matcher = buildMatcher(items)
    matcherFor = items
  }
  return matcher(song)
}

/**
 * Bring excluded playlists from this server up to date, so songs added to one
 * since it was excluded are caught too. Playlists from other servers keep
 * their snapshot. Best effort: a failed fetch keeps the snapshot as well.
 */
async function refreshExcludedPlaylists(server: ServerConfig) {
  const { items, refreshPlaylist } = useExclusionStore.getState()
  await Promise.allSettled(
    items.map(async (e) => {
      if (e.kind !== 'playlist' || e.serverId !== server.id) return
      const songs = await getPlaylistSongs(server, e.playlistId)
      refreshPlaylist(exclusionId(e), songs.map((x) => ({ artist: x.artist, title: x.title })))
    }),
  )
}

// The transport is the authoritative state holder; kept outside zustand.
let transport: Transport | null = null
let producerToken = 0
// True while the background deck producers are still resolving songs. When the
// deck momentarily runs dry (a fast player outpaces slow metadata lookups),
// NEXT_TURN must wait for the next ADD_CARDS instead of letting the reducer
// declare deck exhaustion and end the game.
let producing = false
let pendingNextTurn = false
// Remembered for "rematch".
let lastDeck: DeckOptions = {}
let lastNames: string[] = []
let lastSettings: GameSettings = { winTarget: 10, startTokens: 0, challengeGrace: false }
let playback: PlaybackSettings = DEFAULT_PLAYBACK
let countdownTimer: ReturnType<typeof setInterval> | null = null
let quitHintTimer: ReturnType<typeof setTimeout> | null = null

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
  /** How the current deck was built — decides what to suggest when it runs short. */
  metadataMode: MetadataMode
  /** Brief "swipe back again to quit" hint (Android back gesture). */
  quitHint: boolean
  /** Deck ran dry but more songs are still being resolved — next turn pending. */
  waitingForCards: boolean

  startGame: (opts: StartGameOptions) => Promise<void>
  /** Show the quit hint for ~2s (first back swipe during a game). */
  flashQuitHint: () => void
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

  // Leaving the placing phase (reveal, skip) during the countdown: the mystery
  // song hasn't started yet, and the previous one is still fading out under
  // the countdown. Start the right song now, or the reveal would keep the old
  // one (or silence) playing.
  const endCountdownEarly = () => {
    const wasCounting = countdownTimer != null
    clearCountdown()
    set({ countdown: null, placeCountdown: null })
    const song = get().game.turn.song
    if (wasCounting && song) playSong(song)
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

  // A song that can't be played (gone from the server, server unreachable,
  // bad rip) would otherwise leave the turn in silent limbo: reveal it as
  // 'broken' so the host sees which song failed and why, and the game moves on
  // for free.
  audioPlayer.onError(async () => {
    const playable = () => {
      const phase = get().game.phase
      return get().status === 'ready' && (phase === 'placing' || phase === 'challenging')
    }
    if (!playable()) return
    const song = get().game.turn.song
    // The turn may move on while we ask the server.
    const sameTurn = () => playable() && get().game.turn.song?.id === song?.id
    // The stream URL is fetched by the audio element itself, so it never went
    // through the API's address policy — a LAN address that just went away is
    // indistinguishable from a corrupt file here. demoteIfLanUnreachable
    // settles which it is, then the same song gets one more chance.
    if (song && (await demoteIfLanUnreachable())) {
      if (sameTurn()) playSong(song)
      return
    }
    if (!sameTurn()) return
    clearCountdown()
    set({ countdown: null, placeCountdown: null })
    audioPlayer.unwatch()
    const server = getEffectiveServer()
    const reason = song && server ? await diagnoseStreamFailure(server, song.id) : undefined
    if (!sameTurn()) return
    transport?.dispatch({ type: 'BROKEN', reason })
  })

  return {
    game: initialState(),
    status: 'idle',
    dealt: 0,
    error: null,
    countdown: null,
    placeCountdown: null,
    clipEnded: false,
    metadataMode: 'full',
    quitHint: false,
    waitingForCards: false,

    flashQuitHint() {
      if (quitHintTimer) clearTimeout(quitHintTimer)
      set({ quitHint: true })
      quitHintTimer = setTimeout(() => set({ quitHint: false }), 2000)
    },

    async startGame({ playerNames, settings, deck, playback: pb }) {
      const server = getEffectiveServer()
      if (!server) {
        set({ status: 'error', error: getT().game.noServer })
        return
      }
      lastDeck = deck
      set({ metadataMode: deck.metadataMode ?? 'full' })
      lastNames = playerNames
      lastSettings = settings
      playback = pb

      const myToken = ++producerToken
      producing = true
      pendingNextTurn = false
      set({ status: 'building', dealt: 0, error: null, waitingForCards: false })

      const rng = Math.random
      // Only 'full' mode ranks the pool via Deezer. Without ranking there are
      // no floors or tiers, and curated-canon membership becomes the "known"
      // signal instead (streamed in by produceCurated below, which works in
      // every mode since it uses bundled data plus the user's own server).
      // Years are a separate question, owned by cardMaker.
      const ranked = (deck.metadataMode ?? 'full') === 'full'
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
      const playlistsRefreshed = refreshExcludedPlaylists(server)
      try {
        if (deck.playlistId) {
          // A playlist is already hand-curated: use it whole, just shuffled.
          pool = shuffle(await getPlaylistSongs(server, deck.playlistId), rng)
          await playlistsRefreshed
          pool = pool.filter((s) => !isExcluded(s))
          target = Math.min(target, pool.length)
        } else {
          pool = shuffle(
            await fetchCandidates(server, {
              size: clamp(Math.round(target * 3.5), 160, 300),
              musicFolderIds: deck.musicFolderIds,
              genre: deck.genre,
            }),
            rng,
          )
          await playlistsRefreshed
          pool = pool.filter((s) => !isExcluded(s))
        }
      } catch (e) {
        // A transport failure surfaces as a bare "Failed to fetch" — localize it
        // the way the connection test does. Subsonic's own auth/server messages
        // are informative, so those are passed through.
        const network = e instanceof ApiError && e.kind === 'network'
        set({ status: 'error', error: network ? getT().game.deckNetworkError : (e as Error).message })
        return
      }

      const makeCard = cardMaker(deck)

      const minToStart = playerNames.length + 1
      let started = false
      let deckCount = 0
      const initial: Song[] = []
      let batch: Song[] = []
      // Artists of the last cards dealt, one per player — so batches keep an
      // artist's cards rotating through the players across the seam too.
      const artistGap = playerNames.length
      let recentArtists: string[] = []
      const remember = (dealt: Song[]) => {
        recentArtists = [...recentArtists, ...dealt.map(artistOf)].slice(-artistGap)
      }
      let signalStart: () => void = () => {}
      const startSignal = new Promise<void>((r) => (signalStart = r))

      const flushBatch = () => {
        if (!batch.length || producerToken !== myToken) return
        const classified: ClassifiedSong[] = batch.filter((s) => !isExcluded(s)).map((s) => ({
          song: s,
          decade: Math.floor((s.year as number) / 10) * 10,
          known: true,
        }))
        const ordered = spreadArtists(buildDeckOrder(classified, 1, rng), recentArtists, artistGap)
        batch = []
        remember(ordered)
        transport?.dispatch({ type: 'ADD_CARDS', songs: ordered })
        // A player was waiting on an empty deck — resume their next turn now.
        if (pendingNextTurn) {
          pendingNextTurn = false
          set({ waitingForCards: false })
          get().nextTurn()
        }
      }

      // At most about a tenth of the deck by one artist. A library that is
      // mostly one artist (a discography, a soundtrack) would otherwise fill
      // the deck with it. Cards over the cap are held back, not dropped: once
      // the producers are done, they top up a deck that would run short, so
      // a selection that really is one artist still makes a game.
      const perArtist = artistLimit(Math.max(2, Math.round(target / 10)))
      const heldBack: Song[] = []

      const emittedIds = new Set<string>()
      const emit = (card: Song, uncapped = false) => {
        if (emittedIds.has(card.id)) return // random + canon producers can overlap
        if (isExcluded(card)) return
        if (!perArtist.admit(card, uncapped)) {
          heldBack.push(card)
          return
        }
        emittedIds.add(card.id)
        deckCount++
        if (!started) {
          initial.push(card)
          set({ dealt: initial.length })
          if (initial.length >= minToStart) signalStart()
        } else {
          batch.push(card)
          // Flush immediately when someone is stuck waiting for the deck.
          if (batch.length >= BG_BATCH || pendingNextTurn) flushBatch()
        }
      }

      const overflow: Array<{ song: Song; deezerId?: number }> = []
      const produce = async () => {
        for (const song of pool) {
          if (producerToken !== myToken || deckCount >= target) break
          if (!ranked) {
            // No Deezer: no floor/tiers, so every song in the pool becomes a
            // card. Whether its year is looked up online is cardMaker's call.
            const card = await makeCard(song)
            if (card) emit(card)
            continue
          }
          // A canon song is a top hit even if Deezer under-rates it (older/
          // regional) or has no match — skip the Deezer lookup entirely.
          const curated = boostCurated && isCurated(mainArtist(song), song.title, deck.hitLists)
          const hit = curated ? null : await searchTrack(mainArtist(song), song.title)
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
            musicFolderIds: deck.musicFolderIds,
            want: target,
            maxSearches: 120,
            hitLists: deck.hitLists,
          })
        } catch {
          return
        }
        for (const song of curatedSongs) {
          if (producerToken !== myToken || deckCount >= target) break
          if (isExcluded(song)) continue // skip its metadata lookups
          const card = await makeCard(song)
          if (card) emit(card)
        }
        flushBatch()
      }

      Promise.allSettled([produce(), produceCurated()]).finally(() => {
        if (producerToken === myToken) {
          for (const card of heldBack) {
            if (deckCount >= target) break
            emit(card, true)
          }
          flushBatch()
          producing = false
          // Producers are done for good; a still-pending next turn now really
          // exhausts the deck (the reducer ends the game properly).
          if (pendingNextTurn) {
            pendingNextTurn = false
            set({ waitingForCards: false })
            get().nextTurn()
          }
        }
        signalStart()
      })
      await startSignal

      if (producerToken !== myToken) return
      if (initial.length < minToStart) {
        producerToken++
        const t = getT()
        set({
          status: 'error',
          error: ranked
            ? t.game.notEnoughRanked(initial.length, t.setup.metaNoRanking, t.setup.metaOffline)
            : t.game.notEnoughSongs(initial.length),
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
      const deckStart = spreadArtists([...initial], [], artistGap)
      remember(deckStart)

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
      endCountdownEarly()
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
      endCountdownEarly()
      // Keep the song playing through the reveal (until "Next player"); just
      // stop the clip/lock timer so no timeout kicks in.
      audioPlayer.unwatch()
      transport?.dispatch({ type: 'REVEAL' })
    },

    awardNaming() {
      transport?.dispatch({ type: 'AWARD_NAMING' })
    },

    nextTurn() {
      const g = get().game
      // Deck momentarily dry while songs are still being resolved: hold this
      // turn until the next ADD_CARDS instead of ending the game. (A decided
      // winner still proceeds to gameover regardless of the deck.)
      if (!g.winnerId && producing && g.deckIndex >= g.deck.length) {
        pendingNextTurn = true
        set({ waitingForCards: true })
        return
      }
      transport?.dispatch({ type: 'NEXT_TURN' })
      if (get().game.phase === 'gameover') {
        clearCountdown()
        // Let the winning song bow out under the victory screen rather than
        // cutting it dead the moment the button is tapped.
        audioPlayer.fadeOut(5, { stopAfter: true })
        // Nothing is streaming now — a good moment to notice we came home.
        recheckAddress()
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
      recheckAddress()
      producerToken++
      pendingNextTurn = false
      clearCountdown()
      if (quitHintTimer) clearTimeout(quitHintTimer)
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
        quitHint: false,
        waitingForCards: false,
      })
    },
  }
})

// Something excluded mid-game (e.g. from the reveal screen) must not be dealt
// later in this game either: take its queued cards out of the deck.
useExclusionStore.subscribe(() => {
  const { game } = useGameStore.getState()
  const ids = game.deck.slice(game.deckIndex).filter(isExcluded).map((s) => s.id)
  if (ids.length) transport?.dispatch({ type: 'DROP_CARDS', ids })
})
