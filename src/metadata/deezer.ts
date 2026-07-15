import { JsonCache } from '../lib/cache'
import { rateLimit } from '../lib/throttle'

/**
 * Deezer is our popularity source: keyless, no login. Two signals define how
 * recognizable a track is, and we fold them into one **effective rank**:
 *
 *  1. The track's absolute `rank` (higher = more played worldwide).
 *  2. Whether it's one of the **artist's top tracks** — a strong, objective
 *     recognizability cue that raw play count misses. A famous artist's deep
 *     album cut has a decent absolute rank but isn't a top track (so it stays
 *     out of the "Hits" tier), while a regional artist's signature song is
 *     their #1 even at a modest absolute rank (so it gets promoted).
 *
 * Deezer sends no CORS headers, so this only works where requests bypass the
 * browser CORS gate — i.e. inside the Capacitor Android app (native HTTP). In a
 * plain browser build these calls fail and songs simply fall back to "unknown".
 */
const DEEZER = 'https://api.deezer.com'

export interface DeezerHit {
  id: number
  /** Effective popularity rank (absolute rank, boosted if a top track). */
  rank: number
}

interface DeezerTrack {
  id: number
  rank?: number
  title?: string
  artist?: { id?: number; name?: string }
}
interface DeezerSearchResponse {
  data?: DeezerTrack[]
  error?: unknown
}

const searchCache = new JsonCache<DeezerHit | null>('deezer-search-v2')
const isrcCache = new JsonCache<string[] | null>('deezer-isrc')
const artistTopCache = new JsonCache<Record<string, number> | null>('deezer-artist-top')

// localStorage cache key — deliberately NOT shared with curated.ts's fuzzier
// norm(): changing this shape would invalidate every existing cache entry.
function key(artist: string, title: string): string {
  return `${artist}::${title}`.toLowerCase().replace(/\s+/g, ' ').trim()
}

// Deezer allows bursts (~50 req / 5s); a light spacing keeps us well under it.
const throttled = rateLimit(
  (url: string) => fetch(url, { headers: { Accept: 'application/json' } }),
  120,
)

/** Normalize a track title for matching (drop remaster/version/live suffixes). */
export function normTitle(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ') // "(Remastered 2015)", "[Live]"
    .replace(/\s[-–—]\s.*$/, ' ') // " - Remastered", " - Single Version"
    .replace(/\bfeat\.?.*$/, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** How much a top-track position vouches for recognizability (effective-rank floor). */
function topTrackBoost(position: number): number {
  if (position <= 1) return 950_000
  if (position <= 3) return 850_000
  if (position <= 6) return 720_000
  if (position <= 10) return 600_000
  if (position <= 20) return 460_000
  return 0
}

/**
 * The artist's top tracks as normalized-title → best (lowest) 1-based position.
 * Cached per artist id.
 */
async function artistTopTracks(artistId: number): Promise<Record<string, number>> {
  const ck = String(artistId)
  const cached = artistTopCache.get(ck)
  if (cached !== undefined) return cached ?? {}

  const positions: Record<string, number> = {}
  try {
    const res = await throttled(`${DEEZER}/artist/${artistId}/top?limit=25`)
    if (!res.ok) return {} // rate-limited/server error: don't poison the cache
    const data = (await res.json()) as DeezerSearchResponse
    ;(data.data ?? []).forEach((t, i) => {
      const nt = normTitle(t.title ?? '')
      if (nt && !(nt in positions)) positions[nt] = i + 1
    })
  } catch {
    return {} // transient failure: don't poison the cache
  }
  artistTopCache.set(ck, positions)
  return positions
}

/**
 * Find the best Deezer track for an artist/title and return its **effective**
 * popularity rank (raw rank boosted by artist-top-track membership). A loose
 * (unquoted) query is used because Deezer's strict `artist:"" track:""` form
 * silently returns nothing for many well-known songs (e.g. "99 Luftballons").
 */
export async function searchTrack(artist: string, title: string): Promise<DeezerHit | null> {
  const k = key(artist, title)
  const cached = searchCache.get(k)
  if (cached !== undefined) return cached

  const q = encodeURIComponent(`${artist} ${title}`.trim())
  let hit: DeezerHit | null = null
  try {
    const res = await throttled(`${DEEZER}/search?q=${q}&limit=10`)
    if (!res.ok) return null // rate-limited/server error: don't poison the cache
    const data = (await res.json()) as DeezerSearchResponse
    const a = artist.toLowerCase()
    // Prefer results whose artist matches; among those, the highest rank.
    const matches = (data.data ?? []).filter((t) => (t.artist?.name ?? '').toLowerCase().includes(a))
    const pool = matches.length ? matches : data.data ?? []
    const top = pool.reduce<DeezerTrack | null>(
      (best, t) => (typeof t.rank === 'number' && (!best || (t.rank ?? 0) > (best.rank ?? 0)) ? t : best),
      null,
    )
    if (top && typeof top.rank === 'number') {
      let rank = top.rank
      if (top.artist?.id) {
        const tops = await artistTopTracks(top.artist.id)
        const pos = tops[normTitle(title)] ?? tops[normTitle(top.title ?? '')]
        if (pos) rank = Math.max(rank, topTrackBoost(pos))
      }
      hit = { id: top.id, rank }
    }
  } catch {
    return null // transient failure: don't poison the cache
  }
  searchCache.set(k, hit)
  return hit
}

/** ISRC(s) for a Deezer track — used only as a fallback for year resolution. */
export async function trackIsrc(trackId: number): Promise<string[]> {
  const cacheKey = String(trackId)
  const cached = isrcCache.get(cacheKey)
  if (cached !== undefined) return cached ?? []

  let isrcs: string[] = []
  try {
    const res = await throttled(`${DEEZER}/track/${trackId}`)
    if (!res.ok) return [] // rate-limited/server error: don't poison the cache
    const data = (await res.json()) as { isrc?: string }
    if (data.isrc) isrcs = [data.isrc]
  } catch {
    return []
  }
  isrcCache.set(cacheKey, isrcs)
  return isrcs
}
