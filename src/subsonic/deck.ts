import type { ServerConfig } from '../store/configStore'
import { getRandomSongs, type Song } from './client'

export type Rng = () => number

export interface ClassifiedSong {
  song: Song
  /** Decade bucket, e.g. 1994 → 1990. */
  decade: number
  known: boolean
}

/** Group classified songs into a mutable decade → songs map. */
function groupByDecade(items: ClassifiedSong[]): Map<number, ClassifiedSong[]> {
  const map = new Map<number, ClassifiedSong[]>()
  for (const item of items) {
    const bucket = map.get(item.decade)
    if (bucket) bucket.push(item)
    else map.set(item.decade, [item])
  }
  return map
}

/**
 * Draw one song from a decade→songs pool, choosing the decade with probability
 * ∝ √(remaining count). Gentle spread: busy decades still win more often, but
 * sparse decades ("outliers") get a soft boost. Mutates the pool.
 */
function drawWeightedByDecade(
  pool: Map<number, ClassifiedSong[]>,
  rng: Rng,
): ClassifiedSong | undefined {
  const decades = [...pool.keys()]
  if (decades.length === 0) return undefined

  const weights = decades.map((d) => Math.sqrt(pool.get(d)!.length))
  const sum = weights.reduce((a, b) => a + b, 0)

  let r = rng() * sum
  let idx = 0
  while (idx < decades.length - 1 && r >= (weights[idx] ?? 0)) {
    r -= weights[idx] ?? 0
    idx++
  }

  const decade = decades[idx] as number
  const bucket = pool.get(decade)!
  const j = Math.floor(rng() * bucket.length)
  const [picked] = bucket.splice(j, 1)
  if (bucket.length === 0) pool.delete(decade)
  return picked
}

function poolCount(pool: Map<number, ClassifiedSong[]>): number {
  let n = 0
  for (const bucket of pool.values()) n += bucket.length
  return n
}

/**
 * Order classified candidates into a playable deck. Two rules per draw:
 *  - **75/25 mix**: each draw comes from the "known" pool with probability
 *    `knownRatio` (default 0.75), else "rest"; an empty pool falls back to the
 *    other (graceful when known music is thin).
 *  - **√-weighted decade spread** within the chosen pool.
 * Pure and deterministic given `rng`.
 */
export function buildDeckOrder(
  items: ClassifiedSong[],
  knownRatio = 0.75,
  rng: Rng = Math.random,
): Song[] {
  const known = groupByDecade(items.filter((i) => i.known))
  const rest = groupByDecade(items.filter((i) => !i.known))

  const order: Song[] = []
  const total = items.length
  for (let i = 0; i < total; i++) {
    const knownHas = poolCount(known) > 0
    const restHas = poolCount(rest) > 0
    if (!knownHas && !restHas) break

    const useKnown = knownHas && restHas ? rng() < knownRatio : knownHas
    const picked = drawWeightedByDecade(useKnown ? known : rest, rng)
    if (picked) order.push(picked.song)
  }
  return order
}

/**
 * Cheap heuristic: does this look like a live / unplugged recording? The title
 * check is conservative (a bare "live" in a title like "Live and Let Die"
 * doesn't count — only qualifiers in brackets, after a dash, or "live at/from"
 * phrases). The album check is broader, since live albums are usually named as
 * such ("… Unplugged", "… in Concert", "Das 1000. Konzert"). MusicBrainz's
 * Live release-group type is the authoritative backstop applied later — its
 * own word list (looksLive in metadata/musicbrainz.ts) is intentionally
 * separate: it screens MB titles/disambiguations, not file tags.
 */
const ALBUM_LIVE =
  /\b(live|unplugged|concert|konzert|koncert|in concert|en vivo|en directo|dal vivo|mtv unplugged)\b/i

export function isLiveVersion(title: string, album?: string): boolean {
  const titleLive =
    /[([][^)\]]*\blive\b/i.test(title) ||
    /[-–—]\s*live\b/i.test(title) ||
    /\blive (?:at|from|in|@)\b/i.test(title) ||
    /\bunplugged\b/i.test(title)
  return titleLive || (album ? ALBUM_LIVE.test(album) : false)
}

/** Deck configuration chosen in Game Setup. */
export interface DeckOptions {
  /** Library to draw from (Subsonic music folder id). */
  musicFolderId?: string
  yearFrom?: number
  yearTo?: number
  genre?: string
  /** Total deck size to build. */
  targetSize?: number
  /** Popularity difficulty preset. */
  difficulty?: Difficulty
}

export interface FetchCandidatesOptions {
  size?: number
  musicFolderId?: string
  genre?: string
  /** Drop tracks longer than this (guards against stray audiobook chapters). */
  maxDurationSec?: number
}

/**
 * Pull a large candidate pool from a chosen library and prefilter it (dedup,
 * drop live versions and over-long tracks). We deliberately over-fetch so the
 * popularity selection has a big pool to pick the genuinely known songs from.
 */
export async function fetchCandidates(
  config: ServerConfig,
  options: FetchCandidatesOptions = {},
): Promise<Song[]> {
  const maxDuration = options.maxDurationSec ?? 900
  const raw = await getRandomSongs(config, {
    size: options.size ?? 20,
    genre: options.genre,
    musicFolderId: options.musicFolderId,
  })
  const seen = new Set<string>()
  return raw.filter((s) => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    if (isLiveVersion(s.title, s.album)) return false
    if (s.duration && s.duration > maxDuration) return false
    return true
  })
}

/**
 * Reorder so no two adjacent songs share an artist, when avoidable. Greedy:
 * walk left→right and, whenever a song repeats the previous artist, pull the
 * nearest later song by a different artist into its place. `prevArtist` guards
 * the seam against whatever was dealt just before this batch. Runs of a single
 * artist longer than the rest allows are left as-is (unavoidable).
 */
export function spreadArtists(songs: Song[], prevArtist?: string): Song[] {
  const out = [...songs]
  const artistOf = (s: Song) => (s.artist ?? '').toLowerCase().trim()
  let last = (prevArtist ?? '').toLowerCase().trim()
  for (let i = 0; i < out.length; i++) {
    const cur = out[i] as Song
    if (artistOf(cur) === last) {
      const j = out.findIndex((s, k) => k > i && artistOf(s) !== last)
      if (j !== -1) {
        const [moved] = out.splice(j, 1)
        out.splice(i, 0, moved as Song)
      }
    }
    last = artistOf(out[i] as Song)
  }
  return out
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j] as T, a[i] as T]
  }
  return a
}

// --- Popularity tiers (absolute Deezer-rank thresholds) ---------------------
// Absolute thresholds mean a song's tier is known the instant it's ranked — no
// need to rank the whole library first — which is what lets us stream.

export type Difficulty = 'hits' | 'balanced' | 'deep'

/**
 * Effective rank granted to a song in the bundled famous-songs canon (see
 * metadata/curated.ts). High enough to land it in the top tier of any
 * difficulty, so recognizable songs are strongly favoured regardless of their
 * Deezer play count (which under-rates famous-but-older or regional hits).
 */
export const CURATED_RANK = 800_000

export interface Tier {
  /** Minimum Deezer rank for this tier. */
  minRank: number
  /** Target share of the deck (tiers roughly sum to 1). */
  portion: number
}

/** Tier presets, highest threshold first. The lowest minRank is the floor. */
// Ranks here are the *effective* rank from deezer.ts (absolute rank, boosted by
// artist-top-track membership). Deezer's rank tops near 1M and even huge global
// hits sit ~900k, while famous-but-mid singles land ~600k and a famous artist's
// deep album cut ~450k. "Hits" therefore means genuinely recognizable (top
// tracks + ≥500k), which is why the earlier ≥250k floor felt too hard. Graceful
// backfill fills thin tiers from the next one down; the floor cuts the tail.
export const DIFFICULTY: Record<Difficulty, Tier[]> = {
  hits: [
    { minRank: 680_000, portion: 0.6 },
    { minRank: 500_000, portion: 0.4 },
  ],
  balanced: [
    { minRank: 550_000, portion: 0.4 },
    { minRank: 380_000, portion: 0.35 },
    { minRank: 250_000, portion: 0.25 },
  ],
  deep: [
    { minRank: 350_000, portion: 0.4 },
    { minRank: 150_000, portion: 0.3 },
    { minRank: 60_000, portion: 0.3 },
  ],
}

/** The lowest rank a song may have and still make the deck. */
export function deckFloor(tiers: Tier[]): number {
  return Math.min(...tiers.map((t) => t.minRank))
}

/** Index of the tier a rank falls into, or -1 if below the floor. */
export function tierIndex(rank: number, tiers: Tier[]): number {
  for (let i = 0; i < tiers.length; i++) if (rank >= (tiers[i]?.minRank ?? Infinity)) return i
  return -1
}

/** Target card count per tier for a deck of `target` cards. */
export function computeQuotas(target: number, tiers: Tier[]): number[] {
  return tiers.map((t) => Math.round(target * t.portion))
}
